'use strict';
const initModels = require('./lib/initModels'),
  initSync = require('./lib/syncPlans'),
  stripeApi = require('stripe');
module.exports = function(thorin, opt, pluginName) {
  opt = thorin.util.extend({
    logger: pluginName || 'stripe',
    secretKey: process.env.STRIPE_SECRET_KEY,
    publishKey: process.env.STRIPE_PUBLISH_KEY,
    store: 'sql', // the sql store to use.
    accountModel: 'account',   // the db entity we use to attach the subscription.
    planModel: 'stripe_plan', // the db entity we use for plan definition
    subscriptionModel: 'stripe_subscription',  // the db entity we use for subscription definition
    chargeModel: 'stripe_charge',             // the db entity that contains all the stripe charges for a subscription.
    customerField: 'stripe_customer_id'       // the field where we store the customer's stripe ID
  }, opt);

  const pluginObj = {},
    db = initModels(thorin, opt),
    stripe = stripeApi(opt.secretKey);


  /* Wrapper for db setup */
  pluginObj.setup = function(done) {
    db.setup();
    initSync(thorin, opt, stripe);
    done();
  }

  return pluginObj;
}
module.exports.publicName = 'stripe';