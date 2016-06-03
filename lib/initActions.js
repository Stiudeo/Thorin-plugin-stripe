'use strict';

const STRIPE_WEBHOOK_IPS = 'https://stripe.com/files/ips/ips_webhooks.json';

module.exports = function(thorin, opt, stripe) {
  const logger = thorin.logger(opt.logger);

  /* Initialize the stripe webhooks */
  thorin.loadPath(__dirname + '/actions', thorin, opt, stripe);

  /* Initialize our middleware */
  thorin.loadPath(__dirname + '/middleware', thorin, opt, stripe);

  const act = {};

  act.setup = function() {
    logger.info(`Stripe webhook path: ${opt.webhookPath}`)
    refreshIps(true);
  }

  /* When we run the actions, we have to request the stripe webhook IPs. */
  act.run = function RunActions(done) {
    opt.webhook.ips = thorin.persist('stripe.webhook.ips') || [];
    refreshIps(true);
    done();
  }

  function refreshIps(shouldLog) {
    thorin.fetch(STRIPE_WEBHOOK_IPS).then((res) => {
      return res.json();
    }).then((res) => {
      const ips = res.WEBHOOKS;
      thorin.persist('stripe.webhook.ips', ips);
    }).catch((err) => {
      if(shouldLog) {
        logger.warn(`Could not refresh stripe webhook IP list.`);
        logger.debug(err);
      }
    });
  }

  return act;
}