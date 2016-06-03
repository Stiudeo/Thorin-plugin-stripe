'use strict';
/**
 * The stripe plan encapsulates information about a entity-plan subscription
 * The following fields are used in:
 */
module.exports = function(thorin, opt, storeObj) {

  return function initModel(modelObj, Seq) {

    modelObj
      .field('id', Seq.PRIMARY)
      .field('quantity', Seq.INTEGER, {
        defaultValue: 1
      })
      .field('status', Seq.STRING(50), {
        defaultValue: 'active'
      })
      .field('is_active', Seq.BOOLEAN, {
        defaultValue: true
      })
      .field('is_cancelled', Seq.BOOLEAN, {
        defaultValue: false
      })
      .field('period_start', Seq.DATE, {
        defaultValue: null
      })
      .field('period_end', Seq.DATE, {
        defaultValue: null
      })
      .field('cancelled_at', Seq.DATE, {
        defaultValue: null
      })
      .field('deactivated_at', Seq.DATE, {
        defaultValue: null
      })
      .field('charged_at', Seq.DATE, {
        defaultValue: null
      })
      .field('stripe_subscription_key', Seq.STRING(100))

    modelObj
      .method('getRemainingDays', function() {
        let startDt = new Date(),
          endDt = this.get('period_end');
        if(!endDt) return 0;
        let diff = Math.abs(endDt - startDt);
        let days = Math.floor(diff / 1000 / 60 / 60 / 24);
        return days;
      })
      .method('getTotalDays', function() {
        let startDt = this.get('period_start'),
          endDt = this.get('period_end');
        if(!startDt || !endDt) return 0;
        let diff = Math.abs(endDt - startDt);
        let days = Math.floor(diff / 1000 / 60 / 60 / 24);
        return days;
      });

    modelObj
      .index('stripe_subscription_key')
      .belongsTo(storeObj.camelize(opt.models.plan), {
        as: storeObj.camelize(opt.models.plan),
        create: false,
        update: false
      })
      .belongsTo(storeObj.camelize(opt.models.account), {
        as: storeObj.camelize(opt.models.account),
        constraints: false,
        create: false,
        update: false
      });

  }
};