'use strict';

module.exports = function init(thorin, opt, stripe) {
  const dispatcher = thorin.dispatcher,
    logger = thorin.logger(opt.logger),
    hooker = require('../eventHook')();

  /*
   * This middleware verifies that an incoming webhook is coming from stripe IP addreses, and not other sources.
   * */
  dispatcher
    .addMiddleware('stripe.webhook.verifySource')
    .use((intentObj, next) => {
      const ip = intentObj.client('ip'),
        allowedIps = opt.webhook.ips;
      if (allowedIps.indexOf(ip) === -1) {
        return next(thorin.error('STRIPE.WEBHOOK_IP', 'Invalid stripe webhook caller IP', 401));
      }
      next();
    });

  /*
   * This will automatically register the webhook URL to capture
   * those stripe webhooks.
   * */
  dispatcher
    .addAction('stripe.webhook')
    .alias('POST', opt.webhook.path)
    .input({
      created: dispatcher.validate('DATE'),
      livemode: dispatcher.validate('BOOLEAN'),
      id: dispatcher.validate('STRING'),
      type: dispatcher.validate('STRING'),
      object: dispatcher.validate('STRING'),
      request: dispatcher.validate('ANY').default(null),
      data: dispatcher.validate('ANY').default({})
    })
    .use('stripe.webhook.verifySource')
    .use((intentObj) => {
      // This is where we handle our events coming from the webhook.
      let eventName = intentObj.input('type'),
        eventData = intentObj.input('data'),
        entityType = getEventEntityType(eventName, eventData),
        entityId = getEventEntityId(eventData);
      if(!hooker.hasHook(eventName)) {
        return intentObj.send();
      }
      // IF we have no entity type, we just run the event through the hooker.
      if(!entityType) {
        return hooker.runHook(eventName, eventData, (err) => {
          if(err) {
            logger.warn(`stripe.webhook: ${eventName} encountered an error.`, err);
            return intentObj.error(err);
          }
          logger.trace(`stripe.webhook: processed ${eventName}`);
          intentObj.send();
        });
      }
      // step one is to fetch the event's entity data.
      fetchStripeEntity(entityType, entityId, eventData, eventName, (err, entityObj) => {
        if(err) {
          logger.warn(`stripe.webhook: ${eventName}: failed to fetch stripe ${entityType} with id ${entityId}`, err);
          logger.debug(err);
          return intentObj.error(thorin.error('WEBHOOK_ERROR', err.message, 400)).send();
        }
        // Next, we have to run the event through the hooker.
        hooker.runHook(eventName, entityObj, (err) => {
          if(err) {
            logger.warn(`stripe.webhook: ${eventName} [${entityId || '-'}] encountered an error.`, err);
            return intentObj.error(err);
          }
          logger.trace(`stripe.webhook: processed ${eventName} [${entityType} ${entityId || '-'}]`);
          intentObj.send();
        });
      });
    });

  /*
   * Private function that will call the stripe API to retrieve the given entity
   * */
  function fetchStripeEntity(entityType, entityId, eventData, eventName, done) {
    switch(entityType) {
      case 'charge':
        return stripe.charges.retrieve(entityId, done);
      case 'ballance':
        return stripe.ballance.retrieve(done);
      case 'bitcoin_receiver':
        return stripe.bitcoinReceivers.retrieve(entityId, done);
      case 'dispute':
        return stripe.disputes.retrieve(entityId, done);
      case 'coupon':
        return stripe.coupons.retrieve(entityId, done);
      case 'customer':
        return stripe.customers.retrieve(entityId, done);
      case 'card':
        let customerId;
        try {
          customerId = eventData.object.customer;
        } catch(e) {
        }
        if(customerId) {
          return stripe.customers.retrieveCard(customerId, entityId, done);
        }
      case 'subscription':
        if(eventName === 'customer.subscription.deleted') {
          return done(null, eventData.object);
        }
        return stripe.subscriptions.retrieve(entityId, done);
      case 'invoice':
        return stripe.invoices.retrieve(entityId, done);
      case 'invoiceitem':
        return stripe.invoiceItems.retrieve(entityId, done);
      case 'order':
        return stripe.orders.retrieve(entityId, done);
      case 'plan':
        return stripe.plans.retrieve(entityId, done);
      case 'product':
        return stripe.products.retrieve(entityId, done);
      case 'sku':
        return stripe.skus.retrieve(entityId, done);
      case 'transfer':
        return stripe.transfers.retrieve(entityId, done);
      default:
        return done(null, eventData);
    }
  }

  /*
  * Returns the event's entity type.
  * */
  function getEventEntityType(eventType, eventData) {
    try {
      return eventData.object.object;
    } catch(e) {
      return null;
    }
  }

  function getEventEntityId(eventData) {
    try {
      return eventData.object.id;
    } catch(e) {
      return null;
    }
  }


}
