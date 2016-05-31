'use strict';
module.exports = function(thorin, opt) {
  const logger = thorin.logger(opt.logger);

  const initPlan = require('./model/plan'),
    initCharge = require('./model/charge'),
    initSubscription = require('./model/subscription');
  const loader = {};

  function setupSubscription() {
    let AccountModel = storeObj.model(opt.accountModel);
    if(!AccountModel) {
      logger.fatal('SQL store does not have account model: ' + opt.accountModel);
      return false;
    }
    storeObj.addModel(initPlan(thorin, opt, storeObj), {
      code: opt.planModel
    });
    storeObj.addModel(initSubscription(thorin, opt, storeObj), {
      code: opt.subscriptionModel
    });
    storeObj.addModel(initCharge(thorin, opt, storeObj), {
      code: opt.chargeModel
    })

    // Check if we have to attach the stripe_plan_id field
    let planId = opt.planModel + '_id';
    if(!AccountModel.field[planId]) {
      let fieldOpt = {
        create: false,
        update: false,
        filter: false
      };
      AccountModel.belongsTo(storeObj.camelize(opt.planModel), {
        as: 'plan',
        foreignKey: planId
      });
    }
    // Check if we have to attach the stripe_customer_id field
    if(!AccountModel.field[opt.customerField]) {
      let fieldOpt = {
        create: false,
        update: false,
        filter: false
      };
      AccountModel.field(opt.customerField, Seq.STRING(250), {
        defaultValue: null,
        allowNull: true
      });
    }
  }

  /* Init the db models. */
  loader.init = function() {
    /* SETUP THE SUBSCRIPTION MODE */
    if(opt.mode && opt.mode.indexOf('subscription') !== -1) {
      setupSubscription();
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