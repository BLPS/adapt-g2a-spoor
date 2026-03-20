import Adapt from 'core/js/adapt';
import ScormWrapper from './scorm/wrapper';
import StatefulSession from './adapt-stateful-session';
import OfflineStorage from './adapt-offlineStorage-scorm';
import offlineStorage from 'core/js/offlineStorage';
import { shouldStart as shouldStartCookieLMS, start as startCookieLMS } from './scorm/cookieLMS';
import 'libraries/jquery.keycombo';
import './fixes/harden';

class G2aSpoor extends Backbone.Controller {

  initialize() {
    this.config = null;
    if (shouldStartCookieLMS) startCookieLMS();
    this.scorm = ScormWrapper.getInstance();
    this.listenToOnce(Adapt, 'offlineStorage:prepare', this._prepare);
  }

  _prepare() {
    this.config = Adapt.config.get('_g2aSpoor');
    if (!this.isEnabled) {
      offlineStorage.setReadyStatus();
      return;
    }
    this.statefulSession = new StatefulSession();
    this.offlineStorage = new OfflineStorage(this.statefulSession);
    // force offlineStorage-scorm to initialise suspendDataStore - this allows
    // us to do things like store the user's chosen language before the rest
    // of the course data loads
    offlineStorage.get();
    offlineStorage.setReadyStatus();

    // setup debug window keyboard shortcut
    $.onKeyCombo([68, 69, 86], () => {
      Adapt.g2aSpoor.scorm.showDebugWindow();
    });
  }

  get isEnabled() {
    return (this.config && this.config._isEnabled);
  }

}

Adapt.g2aSpoor = new G2aSpoor();

export default Adapt.g2aSpoor;
