'use strict';
module.exports = function(thorin, opt, stripe) {
  const logger = thorin.logger(opt.logger);

  const initPlan = require('./model/plan'),
    initCharge = require('./model/charge'),
    initSubscription = require('./model/subscription'),
    initAccount = require('./model/account');
  const loader = {};

  function setupSubscription() {
    let AccountModel = storeObj.model(opt.models.account);
    if(!AccountModel) {
      logger.fatal('SQL store does not have account model: ' + opt.models.account);
      return false;
    }
    storeObj.addModel(initPlan(thorin, opt, storeObj), {
      code: opt.models.plan
    });
    storeObj.addModel(initSubscription(thorin, opt, storeObj), {
      code: opt.models.subscription
    });
    storeObj.addModel(initCharge(thorin, opt, storeObj), {
      code: opt.models.charge
    });
    initAccount(thorin, opt, storeObj, stripe);
  }

  function setupProcesses() {
    thorin.loadPath(__dirname + '/process', thorin, opt, stripe);
  }

  /* Init the db models. */
  loader.init = function() {
    /* SETUP THE SUBSCRIPTION MODE */
    if(opt.mode && opt.mode.indexOf('subscription') !== -1) {
      setupSubscription();
      thorin.on(thorin.EVENT.RUN, 'store.' + opt.store, setupProcesses);
    }
  }

  let storeObj, Seq;
  if(!opt.store) return;
  if(opt.store instanceof thorin.Interface.Store) {
    storeObj = opt.store;
    Seq = storeObj.getSequelize();
    loader.init();
  } else {
    thorin.on(thorin.EVENT.INIT, 'store.' + opt.store, (store) => {
      storeObj = store;
      Seq = storeObj.getSequelize();
      loader.init();
    });
  }
  return loader;
}