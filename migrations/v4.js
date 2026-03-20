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
 * removal was missed from legacy schema in v4.1.1 and applied in v5.0.0
 */
describe('adapt-g2a-spoor - to v4.1.1', async () => {
  let config, spoorConfig;
  const oldShouldSubmitScorePath = '_tracking._shouldSubmitScore';
  const shouldSubmitScorePath = '_completionCriteria._shouldSubmitScore';
  whereFromPlugin('adapt-g2a-spoor - from <v4.1.1', { name: 'adapt-g2a-spoor', version: '<4.1.1' });

  whereContent('adapt-g2a-spoor - where _g2aSpoor', async () => {
    config = getConfig();
    spoorConfig = getSpoorConfig();
    return spoorConfig;
  });

  mutateContent('adapt-g2a-spoor - replace _g2aSpoor._tracking._shouldSubmitScore with _completionCriteria._shouldSubmitScore', async () => {
    if (!_.has(config, shouldSubmitScorePath)) _.set(config, shouldSubmitScorePath, _.get(spoorConfig, oldShouldSubmitScorePath, false));
    _.unset(spoorConfig, oldShouldSubmitScorePath);
    return true;
  });

  checkContent('adapt-g2a-spoor - check _g2aSpoor._tracking._shouldSubmitScore replaced', async () => {
    const isValid = !_.has(spoorConfig, oldShouldSubmitScorePath) && _.has(config, shouldSubmitScorePath);
    if (!isValid) throw new Error(`_g2aSpoor.${oldShouldSubmitScorePath} not replaced`);
    return true;
  });

  updatePlugin('adapt-g2a-spoor - update to v4.1.1', { name: 'adapt-g2a-spoor', version: '4.1.1', framework: '>=5.17.8' });

  testSuccessWhere('config with empty spoor', {
    fromPlugins: [{ name: 'adapt-g2a-spoor', version: '4.1.0' }],
    content: [
      { _type: 'config', _g2aSpoor: {} }
    ]
  });

  testSuccessWhere('config with default g2aSpoor._tracking', {
    fromPlugins: [{ name: 'adapt-g2a-spoor', version: '4.1.0' }],
    content: [
      { _type: 'config', _g2aSpoor: { _tracking: { _shouldSubmitScore: true } } }
    ]
  });

  testSuccessWhere('config with empty g2aSpoor._tracking', {
    fromPlugins: [{ name: 'adapt-g2a-spoor', version: '4.1.0' }],
    content: [
      { _type: 'config', _g2aSpoor: { _tracking: {} } }
    ]
  });

  testStopWhere('no spoor', {
    fromPlugins: [{ name: 'adapt-g2a-spoor', version: '4.1.0' }],
    content: [
      { _type: 'config' }
    ]
  });

  testStopWhere('spoor incorrect version', {
    fromPlugins: [{ name: 'adapt-g2a-spoor', version: '4.1.1' }]
  });
});
