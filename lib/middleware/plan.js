'use strict';
/*
 * Registers the stripe plan middleware.
 * */
module.exports = function(thorin, opt, stripe) {
  const logger = thorin.logger(opt.logger + '.subscribe'),
    storeObj = thorin.store(opt.store),
    dispatcher = thorin.dispatcher,
    subscriptionModel = storeObj.camelize(opt.models.subscription),
    planModel = storeObj.camelize(opt.models.plan),
    accountModel = storeObj.camelize(opt.models.account);

  /*
   * This will add a middleware that will find all the stripe plans and place
   * them in the intent's "plans" data
   * */
  dispatcher
    .addMiddleware('stripe.plan.find')
    .use((intentObj, next) => {
      const StripePlan = storeObj.model(planModel);
      StripePlan
        .findAll({
          where: {
            is_active: true
          },
          order: [['level', 'DESC']]
        }).then((plans) => {
        intentObj.data('plans', plans);
        next();
      }).catch(next);
    });

  /*
   * This will add a middleware that will read a single plan by its id.
   * and place it under intent.data's "plan"
   * */
  dispatcher
    .addMiddleware('stripe.plan.read')
    .input({
      plan_id: dispatcher.validate('NUMBER').default(null)
    })
    .use((intentObj, next) => {
      const StripePlan = storeObj.model(planModel);
      if (intentObj.data('plan')) {
        return next();
      }
      if (!intentObj.input('plan_id')) {
        return next(thorin.error('STRIPE.PLAN_MISSING_ID', 'Please select a plan', 400));
      }
      StripePlan.find({
        where: {
          id: intentObj.input('plan_id'),
          is_active: true
        }
      }).then((planObj) => {
        if (!planObj) {
          return next(thorin.error('STRIPE.PLAN_NOT_FOUND', 'Invalid or missing plan', 404));
        }
        intentObj.data('plan', planObj);
        next();
      }).catch(next);
    });

}