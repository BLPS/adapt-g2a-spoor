import {
  describe,
  whereFromPlugin,
  whereContent,
  mutateContent,
  checkContent,
  updatePlugin,
  getConfig,
  testStopWhere,
  testSuccessWhere
} from 'adapt-migrations';
import _ from 'lodash';

function getSpoorConfig() {
  return getConfig()?._g2aSpoor;
}

/**
 * `_tracking._shouldStoreResponse` default updated to `true` - also applied in v2.0.2 task when added with a different default value
 */
describe('adapt-g2a-spoor - to v3.0.0', async () => {
  let config, spoorConfig;
  const shouldStoreResponsesPath = '_tracking._shouldStoreResponses';
  const oldRequireCourseCompletedPath = '_tracking._requireCourseCompleted';
  const requireContentCompletedPath = '_completionCriteria._requireContentCompleted';
  const oldRequireAssessmentPassedPath = '_tracking._requireAssessmentPassed';
  const requireAssessmentCompletedPath = '_completionCriteria._requireAssessmentCompleted';
  whereFromPlugin('adapt-g2a-spoor - from <v3.0.0', { name: 'adapt-g2a-spoor', version: '<3.0.0' });

  whereContent('adapt-g2a-spoor - where _g2aSpoor', async () => {
    config = getConfig();
    spoorConfig = getSpoorConfig();
    return spoorConfig;
  });

  mutateContent('adapt-g2a-spoor - add _g2aSpoor._tracking._shouldStoreResponses', async () => {
    if (!_.has(spoorConfig, shouldStoreResponsesPath)) _.set(spoorConfig, shouldStoreResponsesPath, true);
    return true;
  });

  mutateContent('adapt-g2a-spoor - replace _g2aSpoor._tracking._requireCourseCompleted with _completionCriteria._requireContentCompleted', async () => {
    if (!_.has(config, requireContentCompletedPath)) _.set(config, requireContentCompletedPath, _.get(spoorConfig, oldRequireCourseCompletedPath, true));
    _.unset(spoorConfig, oldRequireCourseCompletedPath);
    return true;
  });

  mutateContent('adapt-g2a-spoor - replace _g2aSpoor._tracking._requireAssessmentPassed with _completionCriteria._requireAssessmentCompleted', async () => {
    if (!_.has(config, requireAssessmentCompletedPath)) _.set(config, requireAssessmentCompletedPath, _.get(spoorConfig, oldRequireAssessmentPassedPath, false));
    _.unset(spoorConfig, oldRequireAssessmentPassedPath);
    return true;
  });

  checkContent('adapt-g2a-spoor - check _g2aSpoor._tracking._shouldStoreResponses added', async () => {
    const isValid = _.has(spoorConfig, shouldStoreResponsesPath);
    if (!isValid) throw new Error(`_g2aSpoor.${shouldStoreResponsesPath} not added`);
    return true;
  });

  checkContent('adapt-g2a-spoor - check _g2aSpoor._tracking._requireCourseCompleted replaced', async () => {
    const isValid = !_.has(spoorConfig, oldRequireCourseCompletedPath) && _.has(config, requireContentCompletedPath);
    if (!isValid) throw new Error(`_g2aSpoor.${oldRequireCourseCompletedPath} not replaced`);
    return true;
  });

  checkContent('adapt-g2a-spoor - check _g2aSpoor._tracking._requireAssessmentPassed replaced', async () => {
    const isValid = !_.has(spoorConfig, oldRequireAssessmentPassedPath) && _.has(config, requireAssessmentCompletedPath);
    if (!isValid) throw new Error(`_g2aSpoor.${oldRequireAssessmentPassedPath} not replaced`);
    return true;
  });

  updatePlugin('adapt-g2a-spoor - update to v3', { name: 'adapt-g2a-spoor', version: '3.0.0', framework: '>=3.0.0' });

  testSuccessWhere('config with empty spoor', {
    fromPlugins: [{ name: 'adapt-g2a-spoor', version: '2.0.13' }],
    content: [
      { _type: 'config', _g2aSpoor: {} }
    ]
  });

  testSuccessWhere('config with populated g2aSpoor._tracking', {
    fromPlugins: [{ name: 'adapt-g2a-spoor', version: '2.0.13' }],
    content: [
      { _type: 'config', _g2aSpoor: { _tracking: { _requireCourseCompleted: false, _requireAssessmentPassed: true } } }
    ]
  });

  testSuccessWhere('config with empty g2aSpoor._tracking', {
    fromPlugins: [{ name: 'adapt-g2a-spoor', version: '2.0.13' }],
    content: [
      { _type: 'config', _g2aSpoor: { _tracking: {} } }
    ]
  });

  testStopWhere('no spoor', {
    fromPlugins: [{ name: 'adapt-g2a-spoor', version: '2.0.13' }],
    content: [
      { _type: 'config' }
    ]
  });

  testStopWhere('spoor incorrect version', {
    fromPlugins: [{ name: 'adapt-g2a-spoor', version: '3.0.0' }]
  });
});

describe('adapt-g2a-spoor - to v3.2.0', async () => {
  let spoorConfig;
  const manifestIdentifierPath = '_advancedSettings._manifestIdentifier';
  whereFromPlugin('adapt-g2a-spoor - from <v3.2.0', { name: 'adapt-g2a-spoor', version: '<3.2.0' });

  whereContent('adapt-g2a-spoor - where missing _g2aSpoor._advancedSettings._manifestIdentifier', async () => {
    spoorConfig = getSpoorConfig();
    if (!spoorConfig) return false;
    return !_.has(spoorConfig, manifestIdentifierPath);
  });

  mutateContent('adapt-g2a-spoor - add _g2aSpoor._advancedSettings._manifestIdentifier', async () => {
    _.set(spoorConfig, manifestIdentifierPath, 'adapt_manifest');
    return true;
  });

  checkContent('adapt-g2a-spoor - check _g2aSpoor._advancedSettings._manifestIdentifier added', async () => {
    const isValid = _.has(spoorConfig, manifestIdentifierPath);
    if (!isValid) throw new Error(`_g2aSpoor.${manifestIdentifierPath} not added`);
    return true;
  });

  updatePlugin('adapt-g2a-spoor - update to v3.2.0', { name: 'adapt-g2a-spoor', version: '3.2.0', framework: '>=3.5.0' });

  testSuccessWhere('config with empty spoor', {
    fromPlugins: [{ name: 'adapt-g2a-spoor', version: '3.1.0' }],
    content: [
      { _type: 'config', _g2aSpoor: {} }
    ]
  });

  testSuccessWhere('config with g2aSpoor._advancedSettings', {
    fromPlugins: [{ name: 'adapt-g2a-spoor', version: '3.1.0' }],
    content: [
      { _type: 'config', _g2aSpoor: { _advancedSettings: {} } }
    ]
  });

  testStopWhere('no spoor', {
    fromPlugins: [{ name: 'adapt-g2a-spoor', version: '3.1.0' }],
    content: [
      { _type: 'config' }
    ]
  });

  testStopWhere('spoor incorrect version', {
    fromPlugins: [{ name: 'adapt-g2a-spoor', version: '3.2.0' }]
  });
});

describe('adapt-g2a-spoor - to v3.3.0', async () => {
  let spoorConfig;
  const exitStateIfIncompletePath = '_advancedSettings._exitStateIfIncomplete';
  const exitStateIfCompletePath = '_advancedSettings._exitStateIfComplete';
  whereFromPlugin('adapt-g2a-spoor - from <v3.3.0', { name: 'adapt-g2a-spoor', version: '<3.3.0' });

  whereContent('adapt-g2a-spoor - where missing exit status', async () => {
    spoorConfig = getSpoorConfig();
    if (!spoorConfig) return false;
    return !_.has(spoorConfig, exitStateIfIncompletePath) || !_.has(spoorConfig, exitStateIfCompletePath);
  });

  mutateContent('adapt-g2a-spoor - add _g2aSpoor._advancedSettings._exitStateIfIncomplete', async () => {
    if (!_.has(spoorConfig, exitStateIfIncompletePath)) _.set(spoorConfig, exitStateIfIncompletePath, 'auto');
    return true;
  });

  mutateContent('adapt-g2a-spoor - add _g2aSpoor._advancedSettings._exitStateIfComplete', async () => {
    if (!_.has(spoorConfig, exitStateIfCompletePath)) _.set(spoorConfig, exitStateIfCompletePath, 'auto');
    return true;
  });

  checkContent('adapt-g2a-spoor - check _g2aSpoor._advancedSettings._exitStateIfIncomplete added', async () => {
    const isValid = _.has(spoorConfig, exitStateIfIncompletePath);
    if (!isValid) throw new Error(`_g2aSpoor.${exitStateIfIncompletePath} not added`);
    return true;
  });

  checkContent('adapt-g2a-spoor - check _g2aSpoor._advancedSettings._exitStateIfComplete added', async () => {
    const isValid = _.has(spoorConfig, exitStateIfCompletePath);
    if (!isValid) throw new Error(`_g2aSpoor.${exitStateIfCompletePath} not added`);
    return true;
  });

  updatePlugin('adapt-g2a-spoor - update to v3.3.0', { name: 'adapt-g2a-spoor', version: '3.3.0', framework: '>=3.5.0' });

  testSuccessWhere('config with empty spoor', {
    fromPlugins: [{ name: 'adapt-g2a-spoor', version: '3.2.0' }],
    content: [
      { _type: 'config', _g2aSpoor: {} }
    ]
  });

  testSuccessWhere('config with g2aSpoor._advancedSettings', {
    fromPlugins: [{ name: 'adapt-g2a-spoor', version: '3.2.0' }],
    content: [
      { _type: 'config', _g2aSpoor: { _advancedSettings: {} } }
    ]
  });

  testStopWhere('no spoor', {
    fromPlugins: [{ name: 'adapt-g2a-spoor', version: '3.2.0' }],
    content: [
      { _type: 'config' }
    ]
  });

  testStopWhere('spoor incorrect version', {
    fromPlugins: [{ name: 'adapt-g2a-spoor', version: '3.3.0' }]
  });
});

describe('adapt-g2a-spoor - to v3.4.0', async () => {
  let spoorConfig;
  const shouldStoreAttemptsPath = '_advancedSettings._shouldStoreAttempts';
  whereFromPlugin('adapt-g2a-spoor - from <v3.4.0', { name: 'adapt-g2a-spoor', version: '<3.4.0' });

  whereContent('adapt-g2a-spoor - where missing _g2aSpoor._advancedSettings._shouldStoreAttempts', async () => {
    spoorConfig = getSpoorConfig();
    if (!spoorConfig) return false;
    return !_.has(spoorConfig, shouldStoreAttemptsPath);
  });

  mutateContent('adapt-g2a-spoor - add _g2aSpoor._advancedSettings._shouldStoreAttempts', async () => {
    _.set(spoorConfig, shouldStoreAttemptsPath, false);
    return true;
  });

  checkContent('adapt-g2a-spoor - check _g2aSpoor._advancedSettings._shouldStoreAttempts added', async () => {
    const isValid = _.has(spoorConfig, shouldStoreAttemptsPath);
    if (!isValid) throw new Error(`_g2aSpoor.${shouldStoreAttemptsPath} not added`);
    return true;
  });

  updatePlugin('adapt-g2a-spoor - update to v3.4.0', { name: 'adapt-g2a-spoor', version: '3.4.0', framework: '>=5.3' });

  testSuccessWhere('config with empty spoor', {
    fromPlugins: [{ name: 'adapt-g2a-spoor', version: '3.3.0' }],
    content: [
      { _type: 'config', _g2aSpoor: {} }
    ]
  });

  testSuccessWhere('config with g2aSpoor._advancedSettings', {
    fromPlugins: [{ name: 'adapt-g2a-spoor', version: '3.3.0' }],
    content: [
      { _type: 'config', _g2aSpoor: { _advancedSettings: {} } }
    ]
  });

  testStopWhere('no spoor', {
    fromPlugins: [{ name: 'adapt-g2a-spoor', version: '3.3.0' }],
    content: [
      { _type: 'config' }
    ]
  });

  testStopWhere('spoor config with _g2aSpoor._advancedSettings._shouldStoreAttempts', {
    fromPlugins: [{ name: 'adapt-g2a-spoor', version: '3.3.0' }],
    content: [
      { _type: 'config', _g2aSpoor: { _advancedSettings: { _shouldStoreAttempts: 'auto' } } }
    ]
  });

  testStopWhere('spoor incorrect version', {
    fromPlugins: [{ name: 'adapt-g2a-spoor', version: '3.4.0' }]
  });
});

describe('adapt-g2a-spoor - to v3.5.0', async () => {
  let spoorConfig;
  const commitOnAnyChangePath = '_advancedSettings._commitOnAnyChange';
  whereFromPlugin('adapt-g2a-spoor - from <v3.5.0', { name: 'adapt-g2a-spoor', version: '<3.5.0' });

  whereContent('adapt-g2a-spoor - where missing _g2aSpoor._advancedSettings._commitOnAnyChange', async () => {
    spoorConfig = getSpoorConfig();
    if (!spoorConfig) return false;
    return !_.has(spoorConfig, commitOnAnyChangePath);
  });

  mutateContent('adapt-g2a-spoor - add _g2aSpoor._advancedSettings._commitOnAnyChange', async () => {
    _.set(spoorConfig, commitOnAnyChangePath, false);
    return true;
  });

  checkContent('adapt-g2a-spoor - check _g2aSpoor._advancedSettings._commitOnAnyChange added', async () => {
    const isValid = _.has(spoorConfig, commitOnAnyChangePath);
    if (!isValid) throw new Error(`_g2aSpoor.${commitOnAnyChangePath} not added`);
    return true;
  });

  updatePlugin('adapt-g2a-spoor - update to v3.5.0', { name: 'adapt-g2a-spoor', version: '3.5.0', framework: '>=5.5' });

  testSuccessWhere('config with empty spoor', {
    fromPlugins: [{ name: 'adapt-g2a-spoor', version: '3.4.0' }],
    content: [
      { _type: 'config', _g2aSpoor: {} }
    ]
  });

  testSuccessWhere('config with g2aSpoor._advancedSettings', {
    fromPlugins: [{ name: 'adapt-g2a-spoor', version: '3.4.0' }],
    content: [
      { _type: 'config', _g2aSpoor: { _advancedSettings: {} } }
    ]
  });

  testStopWhere('no spoor', {
    fromPlugins: [{ name: 'adapt-g2a-spoor', version: '3.4.0' }],
    content: [
      { _type: 'config' }
    ]
  });

  testStopWhere('spoor config with _g2aSpoor._advancedSettings._commitOnAnyChange', {
    fromPlugins: [{ name: 'adapt-g2a-spoor', version: '3.4.0' }],
    content: [
      { _type: 'config', _g2aSpoor: { _advancedSettings: { _commitOnAnyChange: false } } }
    ]
  });

  testStopWhere('spoor incorrect version', {
    fromPlugins: [{ name: 'adapt-g2a-spoor', version: '3.5.0' }]
  });
});

describe('adapt-g2a-spoor - to v3.6.0', async () => {
  let spoorConfig;
  whereFromPlugin('adapt-g2a-spoor - from <v3.6.0', { name: 'adapt-g2a-spoor', version: '<3.6.0' });

  whereContent('adapt-g2a-spoor - where missing _g2aSpoor._messages', async () => {
    spoorConfig = getSpoorConfig();
    if (!spoorConfig) return false;
    return !spoorConfig._messages;
  });

  mutateContent('adapt-g2a-spoor - add _g2aSpoor._messages', async () => {
    spoorConfig._messages = {};
    return true;
  });

  checkContent('adapt-g2a-spoor - check _g2aSpoor._messages added', async () => {
    const isValid = spoorConfig._messages;
    if (!isValid) throw new Error('_g2aSpoor._messages not added');
    return true;
  });

  updatePlugin('adapt-g2a-spoor - update to v3.6.0', { name: 'adapt-g2a-spoor', version: '3.6.0', framework: '>=5.5' });

  testSuccessWhere('config with empty spoor', {
    fromPlugins: [{ name: 'adapt-g2a-spoor', version: '3.5.0' }],
    content: [
      { _type: 'config', _g2aSpoor: {} }
    ]
  });

  testStopWhere('config with g2aSpoor._messages', {
    fromPlugins: [{ name: 'adapt-g2a-spoor', version: '3.5.0' }],
    content: [
      { _type: 'config', _g2aSpoor: { _messages: {} } }
    ]
  });

  testStopWhere('no spoor', {
    fromPlugins: [{ name: 'adapt-g2a-spoor', version: '3.5.0' }],
    content: [
      { _type: 'config' }
    ]
  });

  testStopWhere('spoor incorrect version', {
    fromPlugins: [{ name: 'adapt-g2a-spoor', version: '3.6.0' }]
  });
});
