import Adapt from 'core/js/adapt';
import data from 'core/js/data';
import logging from 'core/js/logging';
import ScormWrapper from './scorm/wrapper';
import COMPLETION_STATE from 'core/js/enums/completionStateEnum';
import SUCCESS_STATE from './enums/successStateEnum';
import ComponentSerializer from './serializers/ComponentSerializer';
import SCORMSuspendData from './serializers/SCORMSuspendData';
import offlineStorage from 'core/js/offlineStorage';

export default class StatefulSession extends Backbone.Controller {

  initialize() {
    _.bindAll(this, 'beginSession', 'onVisibilityChange', 'endSession');
    this.debouncedSaveSession = _.debounce(this.saveSessionState.bind(this), 1);
    this.scorm = ScormWrapper.getInstance();
    this._trackingIdType = 'block';
    this._componentSerializer = null;
    this._shouldCompress = false;
    this._shouldStoreResponses = true;
    this._shouldStoreAttempts = false;
    this._shouldRecordInteractions = true;
    this._shouldRecordObjectives = true;
    this._uniqueInteractionIds = false;
    this._scoreLoopLockState = 0;
    this.beginSession();
  }

  get shouldRecordInteractions() {
    return this._shouldRecordInteractions;
  }

  get shouldRecordObjectives() {
    return this._shouldRecordObjectives;
  }

  beginSession() {
    this.listenTo(Adapt, {
      'app:dataReady': this.restoreSession,
      'adapt:start': this.onAdaptStart
    });
    this._trackingIdType = Adapt.build.get('trackingIdType') || 'block';
    if (window.location.search.indexOf('nolmserrors') !== -1) {
      this.scorm.suppressErrors = true;
    }
    const config = Adapt.g2aSpoor.config;
    if (!config) return;
    const tracking = config._tracking;
    this._shouldStoreResponses = (tracking && tracking._shouldStoreResponses) || false;
    this._shouldStoreAttempts = (tracking && tracking._shouldStoreAttempts) || false;
    this._shouldCompress = (tracking && tracking._shouldCompress) || false;
    this._componentSerializer = new ComponentSerializer(this._trackingIdType, this._shouldCompress);
    if (tracking?._shouldRecordInteractions === false) {
      this._shouldRecordInteractions = false;
    }
    if (tracking?._shouldRecordObjectives === false) {
      this._shouldRecordObjectives = false;
    }
    const settings = config._advancedSettings;
    if (!settings) {
      this.scorm.setVersion('1.2');
      this.scorm.initialize();
      return;
    }
    this._uniqueInteractionIds = settings._uniqueInteractionIds || false;
    this.scorm.initialize(settings);
  }

  restoreSession() {
    this.setupLearnerInfo();
    this.restoreSessionState();
  }

  setupLearnerInfo() {
    const globals = Adapt.course.get('_globals');
    if (!globals._learnerInfo) {
      globals._learnerInfo = {};
    }
    Object.assign(globals._learnerInfo, offlineStorage.get('learnerinfo'));
  }

  restoreSessionState() {
    const sessionPairs = offlineStorage.get();
    const hasNoPairs = !Object.keys(sessionPairs).length;
    if (hasNoPairs) return;
    if (sessionPairs.c) {
      const [ _isComplete, _isAssessmentPassed ] = SCORMSuspendData.deserialize(sessionPairs.c);
      Adapt.course.set({ _isComplete, _isAssessmentPassed });
    }
    if (!sessionPairs.q) return;
    this._componentSerializer?.deserialize(sessionPairs.q);
  }

  setupEventListeners() {
    this.removeEventListeners();
    this.listenTo(Adapt.components, 'change:_isComplete', this.debouncedSaveSession);
    this.listenTo(Adapt.components, 'change:_isSubmitted', this.onComponentsCompleteChange);
    this.listenTo(Adapt.course, 'change:_isComplete', this.debouncedSaveSession);
    this.listenTo(Adapt.course, 'change:_isComplete', this.onCourseCompleteChange);
    if (this._shouldStoreResponses) {
      this.listenTo(data, 'change:_isSubmitted change:_userAnswer', this.debouncedSaveSession);
    }
    this.listenTo(Adapt, {
      'app:dataReady': this.restoreSession,
      'adapt:start': this.onAdaptStart,
      'app:languageChanged': this.onLanguageChanged,
      'pageView:ready': this.onPageViewReady,
      'questionView:recordInteraction': this.onQuestionRecordInteraction,
      'tracking:complete': this.onTrackingComplete
    });
    const config = Adapt.g2aSpoor.config;
    const advancedSettings = config._advancedSettings;
    const shouldCommitOnVisibilityChange = (!advancedSettings ||
        advancedSettings._commitOnVisibilityChangeHidden !== false);
    if (shouldCommitOnVisibilityChange) {
      document.addEventListener('visibilitychange', this.onVisibilityChange);
    }
    $(window).on('beforeunload unload pagehide', this.endSession);
  }

  async saveSessionState() {
    const isMidRender = !Adapt.parentView?.model.get('_isReady');
    if (isMidRender) return this.debouncedSaveSession();
    const courseState = SCORMSuspendData.serialize([
      Boolean(Adapt.course.get('_isComplete')),
      Boolean(Adapt.course.get('_isAssessmentPassed'))
    ]);
    const componentStates = await this._componentSerializer?.serialize(this._shouldStoreResponses, this._shouldStoreAttempts);
    const sessionPairs = { c: courseState, q: componentStates };
    offlineStorage.set(sessionPairs);
    this.printCompletionInformation(sessionPairs);
  }

  printCompletionInformation(suspendData) {
    if (typeof suspendData === 'string') suspendData = JSON.parse(suspendData);
    const courseState = SCORMSuspendData.deserialize(suspendData.c);
    const courseComplete = courseState[0];
    const assessmentPassed = courseState[1];
    const trackingIdModels = data.filter(model => model.get('_type') === this._trackingIdType && model.has('_trackingId'));
    const trackingIds = trackingIdModels.map(model => model.get('_trackingId'));
    if (!trackingIds.length) {
      logging.info(`course._isComplete: ${courseComplete}, course._isAssessmentPassed: ${assessmentPassed}, ${this._trackingIdType} completion: no tracking ids found`);
      return;
    }
    const separatorPos = suspendData.q.indexOf('|');
    let binary = null;
    let textCompletionData = [];
    if (separatorPos !== -1) {
      binary = suspendData.q.substring(0, separatorPos);
      textCompletionData = JSON.parse(suspendData.q.substring((separatorPos + 1)));
    } else {
      binary = suspendData.q;
    }
    const completionData = SCORMSuspendData.deserialize(binary).concat(textCompletionData);
    if (!completionData.length) return;
    const max = Math.max(...completionData.map(item => item[0][0]));
    const shouldStoreResponses = (completionData[0].length === 3);
    const completionString = completionData.reduce((markers, item) => {
      const trackingId = item[0][0];
      const isComplete = shouldStoreResponses ? item[2][1][0] : item[1][0];
      const mark = isComplete ? '1' : '0';
      markers[trackingId] = (markers[trackingId] === '-' || markers[trackingId] === '1') ? mark : '0';
      return markers;
    }, new Array(max + 1).fill('-')).join('');
    logging.info(`course._isComplete: ${courseComplete}, course._isAssessmentPassed: ${assessmentPassed}, ${this._trackingIdType} completion: ${completionString}`);
  }

  // ─── Objectives: per-component (component _id = objective id) ───────────────

  initializeContentObjectives() {
    if (!this.shouldRecordObjectives) return;
    Adapt.contentObjects.forEach(model => {
      if (model.isTypeGroup('course')) return;
      this._initComponentsObjectives(model);
    });
  }

  _initComponentsObjectives(model) {
    this._loopCourseObjectives(model, 'init');
  }

  _loopCourseObjectives(model, mode) {
    if (typeof model.getChildren === 'undefined') return;
    const containerTypes = ['course', 'page', 'article', 'block'];
    const children = model.getChildren();
    for (const child of children) {
      if (containerTypes.includes(child.get('_type'))) {
        this._loopCourseObjectives(child, mode);
      } else {
        if (mode === 'init') this._initComponentObjective(child);
        else if (mode === 'view') this._onComponentViewReady(child);
      }
    }
  }

  _initComponentObjective(model) {
    if (typeof model.getResponseType === 'undefined') return;
    const id = model.get('_id');
    const description = model.get('title') || model.get('displayTitle') || '';
    offlineStorage.set('objectiveDescription', id, description);
    if (model.get('_isVisited')) return;
    offlineStorage.set('objectiveStatus', id,
      COMPLETION_STATE.NOTATTEMPTED.asLowerCase,
      SUCCESS_STATE.UNKNOWN.asLowerCase);
  }

  onAdaptStart() {
    this.setupEventListeners();
    this.initializeContentObjectives();
  }

  // Fired when a page becomes visible — re-applies objective status for already-submitted components
  onPageViewReady(view) {
    if (!this.shouldRecordObjectives) return;
    this._loopCourseObjectives(view.model, 'view');
  }

  _onComponentViewReady(model) {
    if (typeof model.getResponseType === 'undefined') return;
    const isFakeSubmit = typeof model.isFakeSubmit !== 'undefined' ? model.isFakeSubmit() : false;
    if (model.get('_isSubmitted') || isFakeSubmit) {
      this.onComponentsCompleteChange(model, isFakeSubmit);
    }
  }

  // Fired on change:_isSubmitted — writes objective status/score directly using component id
  onComponentsCompleteChange(model, isFakeSubmit) {
    if (typeof model.getResponseType === 'undefined') return;
    const id = model.get('_id');
    const completionStatus = (model.get('_isSubmitted') || isFakeSubmit)
      ? COMPLETION_STATE.COMPLETED.asLowerCase
      : COMPLETION_STATE.INCOMPLETE.asLowerCase;
    const score = { raw: 0, min: 0, max: 0 };
    let successStatus = SUCCESS_STATE.UNKNOWN.asLowerCase;

    if (model.get('_isSubmitted') || isFakeSubmit) {
      successStatus = model.isCorrect?.() ? SUCCESS_STATE.PASSED.asLowerCase : SUCCESS_STATE.FAILED.asLowerCase;
      if (typeof model.isCorrect !== 'undefined') {
        model.markQuestion?.();
        score.raw = model.score ?? model.get('_score') ?? 0;
        score.min = model.minScore ?? model.get('_minScore') ?? 0;
        score.max = model.maxScore ?? model.get('_maxScore') ?? 0;
      }
    }

    offlineStorage.set('objectiveStatus', id, completionStatus, successStatus);
    offlineStorage.set('objectiveScore', id, score.raw, score.min, score.max, false);
    this.updateCourseScore(model);
  }

  // ─── Course score ─────────────────────────────────────────────────────────

  updateCourseScore(model) {
    this._scoreLoopLockState = 2;
    const courseModel = this._getCourseModel(model);
    if (courseModel) this.onCourseCompleteChange(courseModel);
  }

  _getCourseModel(model) {
    if (typeof model.getParent === 'undefined') return null;
    const parent = model.getParent();
    if (!parent) return null;
    if (parent.get('_type') === 'course') return parent;
    return this._getCourseModel(parent);
  }

  onCourseCompleteChange(model) {
    // Prevent double execution when called from both onComponentsCompleteChange and course change:_isComplete
    if (this._scoreLoopLockState === 1) { this._scoreLoopLockState = 0; return; }
    if (this._scoreLoopLockState === 2) this._scoreLoopLockState = 1;

    const score = { raw: 0, min: 0, max: 0 };
    const componentScores = this._loopCourseStructure(model);
    if (componentScores?.length) {
      for (const cs of componentScores) {
        score.raw += cs.raw;
        score.min += cs.min;
        score.max += cs.max;
      }
    }
    offlineStorage.set('courseScore', score.raw, score.min, score.max);
  }

  _loopCourseStructure(model) {
    if (typeof model.getChildren === 'undefined') return null;
    const containerTypes = ['course', 'page', 'article', 'block'];
    let scores = [];
    for (const child of model.getChildren()) {
      if (containerTypes.includes(child.get('_type'))) {
        const childScores = this._loopCourseStructure(child);
        if (childScores?.length) scores = scores.concat(childScores);
      } else {
        const cs = this._getComponentScore(child);
        if (cs) scores.push(cs);
      }
    }
    return scores.length ? scores : null;
  }

  _getComponentScore(model) {
    if (typeof model.getResponseType === 'undefined') return null;
    const score = { raw: 0, min: 0, max: model.maxScore ?? model.get('_maxScore') ?? 0 };
    if (typeof model.isCorrect !== 'undefined') {
      model.markQuestion?.();
      score.raw = model.score ?? model.get('_score') ?? 0;
      score.min = model.minScore ?? model.get('_minScore') ?? 0;
    }
    return score;
  }

  // ─── Interactions ────────────────────────────────────────────────────────

  onQuestionRecordInteraction(questionView) {
    if (!this.shouldRecordInteractions) return;
    if (!this.scorm.isSupported('cmi.interactions._count')) return;
    const model = questionView.model;
    const responseType = model.getResponseType?.() ?? questionView.getResponseType?.();
    if (_.isEmpty(responseType)) return;
    const id = this._uniqueInteractionIds
      ? `${this.scorm.getInteractionCount()}-${model.get('_id')}`
      : model.get('_id');
    const response = model.getResponse?.() ?? questionView.getResponse?.();
    const result = model.isCorrect?.() ?? questionView.isCorrect?.();
    const latency = model.getLatency?.() ?? questionView.getLatency?.();
    offlineStorage.set('interaction', id, response, result, latency, responseType);
  }

  // ─── Standard session lifecycle ──────────────────────────────────────────

  onLanguageChanged() {
    this.stopListening(Adapt.components, 'change:_isSubmitted', this.onComponentsCompleteChange);
    this.stopListening(Adapt.course, 'change:_isComplete', this.onCourseCompleteChange);
    const config = Adapt.g2aSpoor.config;
    if (config?._reporting?._resetStatusOnLanguageChange !== true) return;
    offlineStorage.set('status', COMPLETION_STATE.INCOMPLETE.asLowerCase);
  }

  onVisibilityChange() {
    if (document.visibilityState === 'hidden') this.scorm.commit();
  }

  onTrackingComplete(completionData) {
    const config = Adapt.g2aSpoor.config;
    this.saveSessionState();
    let completionStatus = completionData.status.asLowerCase;
    switch (completionData.status) {
      case COMPLETION_STATE.COMPLETED:
      case COMPLETION_STATE.PASSED:
        completionStatus = config?._reporting?._onTrackingCriteriaMet ?? completionStatus;
        break;
      case COMPLETION_STATE.FAILED:
        completionStatus = config?._reporting?._onAssessmentFailure ?? completionStatus;
        break;
    }
    offlineStorage.set('status', completionStatus);
  }

  endSession() {
    if (!this.scorm.finishCalled) this.scorm.finish();
    this.removeEventListeners();
  }

  removeEventListeners() {
    $(window).off('beforeunload unload pagehide', this.endSession);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    this.stopListening();
  }

}
