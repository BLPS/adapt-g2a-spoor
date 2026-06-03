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
    // suppress SCORM errors if 'nolmserrors' is found in the querystring
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
    // Default should be to record interactions, so only avoid doing that if
    // _shouldRecordInteractions is set to false
    if (tracking?._shouldRecordInteractions === false) {
      this._shouldRecordInteractions = false;
    }
    if (tracking?._shouldRecordObjectives === false) {
      this._shouldRecordObjectives = false;
    }
    const settings = config._advancedSettings;
    if (!settings) {
      // force use of SCORM 1.2 by default - some LMSes (SABA/Kallidus for instance)
      // present both APIs to the SCO and, if given the choice, the pipwerks
      // code will automatically select the SCORM 2004 API - which can lead to
      // unexpected behaviour.
      this.scorm.setVersion('1.2');
      this.scorm.initialize();
      return;
    }
    this._uniqueInteractionIds = settings._scormVersion === '2004' ? true : (settings._uniqueInteractionIds || false);
    this.scorm.initialize(settings);
  }

  restoreSession() {
    this.setupLearnerInfo();
    this.restoreSessionState();
  }

  setupLearnerInfo() {
    // Replace the hard-coded _learnerInfo data in _globals with the actual data
    // from the LMS
    // If the course has been published from the AT, the _learnerInfo object
    // won't exist so we'll need to create it
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
      Adapt.course.set({
        _isComplete,
        _isAssessmentPassed
      });
    }
    if (!sessionPairs.q) return;
    this._componentSerializer?.deserialize(sessionPairs.q);
  }

  setupEventListeners() {
    this.removeEventListeners();
    this.listenTo(Adapt.components, 'change:_isComplete', this.debouncedSaveSession);
    // this.listenTo(Adapt.components, 'change:_isComplete', this.onComponentsCompleteChange);
    this.listenTo(Adapt.components, 'change:_isSubmitted', this.onComponentsCompleteChange);
    // this.listenTo(Adapt.contentObjects, 'change:_isComplete', this.onContentObjectCompleteChange);
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
    // Wait until finished rendering to save
    if (isMidRender) return this.debouncedSaveSession();
    const courseState = SCORMSuspendData.serialize([
      Boolean(Adapt.course.get('_isComplete')),
      Boolean(Adapt.course.get('_isAssessmentPassed'))
    ]);

    const componentStates = await this._componentSerializer?.serialize(this._shouldStoreResponses, this._shouldStoreAttempts);
    const sessionPairs = {
      c: courseState,
      q: componentStates
    };
    offlineStorage.set(sessionPairs);
    this.printCompletionInformation(sessionPairs);
  }

  printCompletionInformation(suspendData) {
    if (typeof suspendData === 'string') {
      // In-case LMS data is passed as a string
      suspendData = JSON.parse(suspendData);
    }
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

    if (!completionData.length) {
      return;
    }

    const max = Math.max(...completionData.map(item => item[0][0]));
    const shouldStoreResponses = (completionData[0].length === 3);
    const completionString = completionData.reduce((markers, item) => {
      const trackingId = item[0][0];
      const isComplete = shouldStoreResponses ?
        item[2][1][0] :
        item[1][0];
      const mark = isComplete ? '1' : '0';
      markers[trackingId] = (markers[trackingId] === '-' || markers[trackingId] === '1') ?
        mark :
        '0';
      return markers;
    }, new Array(max + 1).fill('-')).join('');
    logging.info(`course._isComplete: ${courseComplete}, course._isAssessmentPassed: ${assessmentPassed}, ${this._trackingIdType} completion: ${completionString}`);
  }

  initializeContentObjectives() {
    if (!this.shouldRecordObjectives) return;
    Adapt.contentObjects.forEach(model => {
      if (model.isTypeGroup('course')) return;
      this.initializeComponentsObjectives(model);
      // const id = model.get('_id');
      // const description = model.get('title') || model.get('displayTitle');
      // offlineStorage.set('objectiveDescription', id, description);
      // if (model.get('_isVisited')) return;
      // const completionStatus = COMPLETION_STATE.NOTATTEMPTED.asLowerCase;
      // const successStatus = SUCCESS_STATE.UNKNOWN.asLowerCase;
      // offlineStorage.set('objectiveStatus', id, completionStatus, successStatus);
    });
  }

  initializeComponentsObjectives(model) {
    this.loopCourseObjectives(model, 'init');
  }

  loopCourseObjectives(model, mode) {
    if (typeof model.getChildren === 'undefined') { return null; }
    const loopElements = ['CourseModel', 'PageModel', 'ArticleModel', 'BlockModel'];
    const children = model.getChildren();
    for (const childModel of children) {
      if (loopElements.includes(childModel.constructor.name)) {
        this.loopCourseObjectives(childModel, mode);
      } else {
        if (mode === 'init') {
          this.initializeComponentObjective(childModel);
        } else if (mode === 'view') {
          this.onComponentViewReady(childModel);
        }
      }
    }
  }

  initializeComponentObjective(model) {
    const id = model.get('_id');
    const description = model.get('title') || model.get('displayTitle');
    if (typeof model.getResponseType !== 'undefined') {
      offlineStorage.set('objectiveDescription', id, description);
      if (model.get('_isVisited')) return;
      const completionStatus = COMPLETION_STATE.NOTATTEMPTED.asLowerCase;
      const successStatus = SUCCESS_STATE.UNKNOWN.asLowerCase;
      offlineStorage.set('objectiveStatus', id, completionStatus, successStatus);
    }
  }

  onAdaptStart() {
    this.setupEventListeners();
    this.initializeContentObjectives();
  }

  onLanguageChanged() {
    // this.stopListening(Adapt.components, 'change:_isComplete', this.onComponentsCompleteChange);
    this.stopListening(Adapt.components, 'change:_isSubmitted', this.onComponentsCompleteChange);
    // this.stopListening(Adapt.contentObjects, 'change:_isComplete', this.onContentObjectCompleteChange);
    this.stopListening(Adapt.course, 'change:_isComplete', this.onCourseCompleteChange);
    const config = Adapt.g2aSpoor.config;
    if (config?._reporting?._resetStatusOnLanguageChange !== true) return;
    const completionStatus = COMPLETION_STATE.INCOMPLETE.asLowerCase;
    offlineStorage.set('status', completionStatus);
  }

  onVisibilityChange() {
    if (document.visibilityState === 'hidden') this.scorm.commit();
  }

  onPageViewReady(view) {
    if (!this.shouldRecordObjectives) return;
    const model = view.model;
    // if (model.get('_isComplete')) return;
    // const id = model.get('_id');
    // const completionStatus = COMPLETION_STATE.INCOMPLETE.asLowerCase;
    // const successStatus = SUCCESS_STATE.UNKNOWN.asLowerCase;
    // offlineStorage.set('objectiveStatus', id, completionStatus, successStatus);
    this.onComponentsViewReady(model);
  }

  onComponentsViewReady(model) {
    this.loopCourseObjectives(model, 'view');
  }

  onComponentViewReady(model) {
    // if (model.get('_isComplete')) return;
    if (typeof model.getResponseType !== 'undefined') {
      const isFakeSubmit = typeof model.isFakeSubmit !== 'undefined' ? model.isFakeSubmit() : false;
      if (model.get('_isSubmitted') || isFakeSubmit) {
        this.onComponentsCompleteChange(model, isFakeSubmit);
      }
    }
  }

  onQuestionRecordInteraction(questionView) {
    if (!this.shouldRecordInteractions) return;
    if (!this.scorm.isSupported('cmi.interactions._count')) return;
    // View functions are deprecated: getResponseType, getResponse, isCorrect, getLatency
    const questionModel = questionView.model;
    const responseType = (questionModel.getResponseType ? questionModel.getResponseType() : questionView.getResponseType());
    // If responseType doesn't contain any data, assume that the question
    // component hasn't been set up for cmi.interaction tracking
    if (_.isEmpty(responseType)) return;
    const id = this._uniqueInteractionIds
      ? `${this.scorm.getInteractionCount()}-${questionModel.get('_id')}`
      : questionModel.get('_id');
    const response = (questionModel.getResponse ? questionModel.getResponse() : questionView.getResponse());
    const result = (questionModel.isCorrect ? questionModel.isCorrect() : questionView.isCorrect());
    const latency = (questionModel.getLatency ? questionModel.getLatency() : questionView.getLatency());
    offlineStorage.set('interaction', id, response, result, latency, responseType);
  }

  onContentObjectCompleteChange(model) {
    // if (!this.shouldRecordObjectives) return;
    // if (model.isTypeGroup('course')) return;
    // const id = model.get('_id');
    // const completionStatus = (model.get('_isComplete') ? COMPLETION_STATE.COMPLETED : COMPLETION_STATE.INCOMPLETE).asLowerCase;
    // let successStatus = SUCCESS_STATE.UNKNOWN.asLowerCase;
    // let isCorrect = null;
    //
    // let score = {
    //   max: 0,
    //   min: 0,
    //   raw: 0
    // };
    //
    // const children = model.getChildren();
    // for (const child of children) {
    //   if (child.constructor.name === 'ArticleModel') {
    //     const childrenA = child.getChildren();
    //     for (const childA of childrenA) {
    //       if (childA.constructor.name === 'BlockModel') {
    //         const childrenB = childA.getChildren();
    //         for (const childB of childrenB) {
    //           if (childB.get('_isComplete') && typeof childB.isCorrect !== 'undefined') {
    //             if (isCorrect === null) {
    //               isCorrect = childB.isCorrect();
    //             } else if (isCorrect === true && !childB.isCorrect()) {
    //               isCorrect = childB.isCorrect();
    //             }
    //             if (typeof childB.markQuestion !== 'undefined') {
    //               childB.markQuestion();
    //             }
    //             score.raw = score.raw + childB.score;
    //             score.min = score.min + childB.minScore;
    //             score.max = score.max + childB.maxScore;
    //           }
    //         }
    //       }
    //     }
    //   }
    // }
    //
    // if (isCorrect !== null && model.get('_isComplete')) {
    //   successStatus = isCorrect ? SUCCESS_STATE.PASSED.asLowerCase : SUCCESS_STATE.FAILED.asLowerCase;
    // }
    // if (isCorrect === null) {
    //   score = null;
    // }
    //
    // offlineStorage.set('objectiveStatus', id, completionStatus, successStatus);
    // if (score !== null) {
    //   offlineStorage.set('objectiveScore', id, score.raw, score.min, score.max, false);
    // } else {
    //   offlineStorage.set('objectiveScore', id, 0, 0, 0, false);
    // }
  }

  onComponentsCompleteChange(model, isFakeSubmit) {
    const id = model.get('_id');
    if (typeof model.getResponseType !== 'undefined') {
      // const completionStatus = (model.get('_isComplete') ? COMPLETION_STATE.COMPLETED : COMPLETION_STATE.INCOMPLETE).asLowerCase;
      const completionStatus = (model.get('_isSubmitted') || isFakeSubmit ? COMPLETION_STATE.COMPLETED : COMPLETION_STATE.INCOMPLETE).asLowerCase;
      const score = {
        max: 0,
        min: 0,
        raw: 0
      };
      let successStatus = SUCCESS_STATE.UNKNOWN.asLowerCase;
      // if (model.get('_isComplete')) {
      if (model.get('_isSubmitted') || isFakeSubmit) {
        successStatus = model.isCorrect() ? SUCCESS_STATE.PASSED.asLowerCase : SUCCESS_STATE.FAILED.asLowerCase;

        if (typeof model.isCorrect !== 'undefined') {
          if (typeof model.markQuestion !== 'undefined') {
            model.markQuestion();
          }
          score.raw = model.score;
          score.min = model.minScore;
          score.max = model.maxScore;
        }
      }
      offlineStorage.set('objectiveStatus', id, completionStatus, successStatus);
      offlineStorage.set('objectiveScore', id, score.raw, score.min, score.max, false);
      this.updateCourseScore(model);
    }
  }

  updateCourseScore(model) {
    this._scoreLoopLockState = 2;
    const courseModel = this.getCourseModel(model);
    if (!courseModel) return null;
    this.onCourseCompleteChange(courseModel);
  }

  getCourseModel(model) {
    if (typeof model.getParent === 'undefined') return null;
    const parentModel = model.getParent();
    if (!parentModel) return null;
    if (parentModel.get('_type') === 'course') return parentModel;
    return this.getCourseModel(parentModel);
  }

  onCourseCompleteChange(model) {

    // prevent double onCourseCompleteChange execution from onComponentsCompleteChange and course change:_isComplete at the same time
    if (this._scoreLoopLockState === 1) {
      this._scoreLoopLockState = 0;
      return;
    }
    if (this._scoreLoopLockState === 2) {
      this._scoreLoopLockState = 1;
    }

    // _type = course
    const score = {
      max: 0,
      min: 0,
      raw: 0,
      scaled: 0
    };
    // if (model.get('_isComplete')) {
    const componentsScore = this.loopCourseStructure(model);
    if (componentsScore !== null && componentsScore.length > 0) {
      for (const componentScore of componentsScore) {
        score.max = score.max + componentScore.max;
        score.min = score.min + componentScore.min;
        score.raw = score.raw + componentScore.raw;
      }
    }
    // }

    offlineStorage.set('courseScore', score.raw, score.min, score.max);
  }

  loopCourseStructure(model) {
    if (typeof model.getChildren === 'undefined') { return null; }
    // const loopElements = ['CourseModel', 'PageModel', 'ArticleModel', 'BlockModel'];
    const loopElements = ['course', 'page', 'article', 'block'];
    let score = [];
    const children = model.getChildren();
    for (const childModel of children) {
      if (loopElements.includes(childModel.get('_type'))) {
        const loopScore = this.loopCourseStructure(childModel);
        if (loopScore !== null && loopScore.length > 0) {
          score = score.concat(loopScore);
        }
      } else {
        const componentScore = this.getComponentScore(childModel);
        if (componentScore !== null) {
          score.push(componentScore);
        }
      }
    }
    return score.length > 0 ? score : null;
  }

  getComponentScore(model) {
    const score = {
      max: 0,
      min: 0,
      raw: 0,
      type: model.get('_type'),
      id: model.get('_id'),
      c: model.constructor.name
    };

    if (typeof model.getResponseType !== 'undefined') {
      score.max = model.maxScore;
      score.max = model.maxScore;

      if (typeof model.isCorrect !== 'undefined') {
        if (typeof model.markQuestion !== 'undefined') {
          model.markQuestion();
        }
        score.raw = model.score;
      }

      return score;
    }
    return null;
  }

  onTrackingComplete(completionData) {
    const config = Adapt.g2aSpoor.config;
    this.saveSessionState();
    let completionStatus = completionData.status.asLowerCase;
    // The config allows the user to override the completion state.
    switch (completionData.status) {
      case COMPLETION_STATE.COMPLETED:
      case COMPLETION_STATE.PASSED: {
        if (!config?._reporting?._onTrackingCriteriaMet) {
          logging.warn(`No value defined for '_onTrackingCriteriaMet', so defaulting to '${completionStatus}'`);
        } else {
          completionStatus = config._reporting._onTrackingCriteriaMet;
        }

        break;
      }
      case COMPLETION_STATE.FAILED: {
        if (!config?._reporting?._onAssessmentFailure) {
          logging.warn(`No value defined for '_onAssessmentFailure', so defaulting to '${completionStatus}'`);
        } else {
          completionStatus = config._reporting._onAssessmentFailure;
        }
      }
    }
    offlineStorage.set('status', completionStatus);
  }

  endSession() {
    if (!this.scorm.finishCalled) {
      this.scorm.finish();
    }
    this.removeEventListeners();
  }

  removeEventListeners() {
    $(window).off('beforeunload unload pagehide', this.endSession);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    this.stopListening();
  }

}
