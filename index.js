'use strict';
const initModels = require('./lib/initModels'),
  initSync = require('./lib/syncPlans'),
  initActions = require('./lib/initActions'),
  initHooker = require('./lib/eventHook'),
  stripeApi = require('stripe');
module.exports = function(thorin, opt, pluginName) {
  const async = thorin.util.async;
  opt = thorin.util.extend({
    logger: pluginName || 'stripe',
    secretKey: process.env.STRIPE_SECRET_KEY,
    publishKey: process.env.STRIPE_PUBLISH_KEY,
    appName: 'Stripe app',    // your application name, that will appear in all descriptions
    store: 'sql', // the sql store to use.
    mode: ['subscription'], // the modes we will run the plugin, If no mode is set, we will not setup any db and will only be able to charge.
    models: {
      account: 'account', // the db entity we use to attach the subscription.
      plan: 'stripe_plan',  // the db entity we use for plan definition
      subscription: 'stripe_subscription',  // the db entity we use for subscription definition
      charge: 'stripe_charge' // the db entity that contains all the stripe charges for a subscription.
    },
    fields: {
      customer: 'stripe_customer_key'  // the field where we store the customer's stripe ID
    },
    invoice: {
      prefix: '', // the prefix of the invoice number. Eg: S000001
      length: 6   // the number of chars the invoice number has. Eg, length=6 => S000012
    },
    defaultPlan: null,  // The default plan code, when downgrading an account, we will update its plan to this one (the free plan)
    webhook: {
      path: '/webhook/stripe',  // the webhook path
      ips: []                   // array of source IPs from stripe, which we use to allow webhooks.
    }
  }, opt);

  const pluginObj = {},
    logger = thorin.logger(opt.logger),
    stripe = stripeApi(opt.secretKey),
    hooker = initHooker(thorin, opt),
    db = initModels(thorin, opt, stripe),
    act = initActions(thorin, opt, stripe);


  /* Wrapper for db setup */
  pluginObj.setup = function(done) {
    initSync(thorin, opt, stripe);
    logger.info(`Add stripe webhook with endpoint: ${opt.webhook.path}`)
    done();
  }

  /* Run the plugin */
  pluginObj.run = function(done) {
    const calls = [];
    calls.push((done) => act.run(done));
    async.series(calls, done);
  }

  /* Register a custom hook handler */
  pluginObj.addHook = hooker.addHook.bind(hooker);

  /* Expose the stripe instance */
  pluginObj.stripe = stripe;


  return pluginObj;
}
module.exports.publicName = 'stripe';