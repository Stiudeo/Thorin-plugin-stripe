'use strict';

module.exports = function(thorin, opt, stripe, done) {
  const logger = thorin.logger(opt.logger),
    storeObj = thorin.store(opt.store);
  /* CHECK if we have subscription mode to sync. */
  function syncPlans() {
    // We have to read all our plans from the db, and sync them with the ones from stripe.
    // NOTE: stripe plan.id = dbPlan.code
    const calls = [];
    let plans = [],
      stripePlans = [];
    // read plans from db
    calls.push(() => {
      const StripePlan = storeObj.model(storeObj.camelize(opt.models.plan));
      return StripePlan.findAll().then((items) => {
        plans = items;
      });
    });

    // read plans from stripe.
    calls.push(() => {
      if(plans.length === 0) {
        logger.warn(`Stripe has no plans created.`);
        return;
      }  // no stripe plans.
      logger.trace(`Fetching stripe plans...`);
      return stripe.plans.list().then((res) => {
        stripePlans = res.data;
      });
    });
    const toCreate = [],
      toUpdate = [];
    // Check if we have to update any local plan or create it.
    calls.push(() => {
      if(plans.length === 0) return;
      const planMap = {},
        stripeMap = {};
      plans.forEach((planObj) => {
        planMap[planObj.name] = planObj;
      });
      stripePlans.forEach((item) => {
        stripeMap[item.id] = item;
      })
      // now, check creates
      for(let i=0; i < plans.length; i++) {
        let planObj = plans[i];
        if(!stripeMap[planObj.code]) {
          toCreate.push(planObj);
        }
      }
      // check update
      for(let i=0; i < stripePlans.length; i++) {
        let stripeObj = stripePlans[i],
          planObj = planMap[stripeObj.id];
        if(!planObj) continue;
        planObj.set('amount', stripeObj.amount);
        planObj.set('currency', stripeObj.currency);
        toUpdate.push(planObj);
      }
    });
    // check if we have to Create any plan in stripe.
    calls.push(() => {
      if(toCreate.length === 0) return;
      const calls = [];
      toCreate.forEach((planObj) => {
        calls.push(() => {
          const data = {
            id: planObj.code,
            name: planObj.name,
            statement_descriptor: planObj.description.substr(0, 20),
            amount: planObj.amount,
            currency: planObj.currency,
            interval: planObj.interval_type,
            interval_count: planObj.interval_value
          };
          if(planObj.trial_days > 0) {
            data.trial_period_days = planObj.trial_days;
          }
          return stripe.plans.create(data).then((result) => {
            logger.trace(`Plan ${data.id} created`);
          });
        });
      });
      return thorin.series(calls);
    });

    // Check if we have to update anything.
    calls.push(() => {
      if(toUpdate.length === 0) return;
      const calls = [];
      toUpdate.forEach((planObj) => {
        calls.push(() => {
          return planObj.save().then(() => {
            logger.trace(`Plan ${planObj.id} updated.`);
          });
        });
      });
      return thorin.series(calls);
    })
    // wait till we connect to the db
    thorin.on(thorin.EVENT.RUN, 'store.' + opt.store, () => {
      thorin.series(calls, (err) => {
        if(err) {
          logger.fatal(`Could not complete stripe plan setup.`);
          logger.debug(err);
          return;
        }
        logger.info(`Stripe plan sync completed.`);
      });
    });
  }
  if(opt.mode && opt.mode.indexOf('subscription') !== -1) {
    syncPlans();
  }
}