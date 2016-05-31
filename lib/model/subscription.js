'use strict';
/**
 * The stripe plan encapsulates information about a entity-plan subscription
 * The following fields are used in:
 */
module.exports = function(thorin, opt, storeObj) {

  return function initModel(modelObj, Seq) {

    modelObj
      .field('id', Seq.PRIMARY)
      .field('amount', Seq.INTEGER, {
        defaultValue: 0
      })
      .field('interval_type', Seq.ENUM('day', 'week', 'month', 'year'))
      .field('interval_value', Seq.INTEGER)
      .field('is_active', Seq.BOOLEAN, {
        defaultValue: true
      })
      .field('cancelled_at', Seq.DATE, {
        defaultValue: null,
        allowNull: true
      })
      .field('charged_at', Seq.DATE, {
        defaultValue: null,
        allowNull: true
      })
      .field('stripe_subscription_key', Seq.STRING(100))

    modelObj
      .index('stripe_subscription_key')
      .belongsTo(storeObj.camelize(opt.planModel), {
        create: false,
        update: false
      })
      .belongsTo(storeObj.camelize(opt.accountModel), {
        as: storeObj.camelize(opt.accountModel),
        create: false,
        update: false
      });

  }
};