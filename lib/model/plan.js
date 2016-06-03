'use strict';
/**
 * The stripe plan encapsulates information about a subscription plan.
 * The following fields are used in:
 *  - name -> the public name of the subscription (eg: My Subscription Platinum)
 *  - description -> public text that appears on invoices, max 20 chars
 *  - level -> a private numeric value that represents the level of access of the customer in the app. Eg: 0=free, 1=some features, 2=many features, 3=full features
 *  - amount -> the default amount that we perceive per this type of plan
 *  - trial_days -> the number of trial days for the user.
 *  - interval_type -> the charge interval. Values are: day, week, month, year
 *  - interval_value -> the actual number of interval_type. We use these to calculate the next billing cycle.
 */
module.exports = function(thorin, opt) {

  return function initModel(modelObj, Seq) {

    modelObj
      .field('id', Seq.PRIMARY)
      .field('code', Seq.STRING(100))
      .field('name', Seq.STRING(200))
      .field('description', Seq.STRING(50))
      .field('level', Seq.INTEGER, {
        defaultValue: 0,
        allowNull: false
      })
      .field('amount', Seq.INTEGER, {
        defaultValue: 0
      })
      .field('max_quantity', Seq.INTEGER, { // when set to 0, we can do unlimited.
        defaultValue: 1
      })
      .field('currency', Seq.STRING(10), {
        defaultValue: 'USD'
      })
      .field('trial_days', Seq.INTEGER, {
        defaultValue: 0
      })
      .field('interval_type', Seq.ENUM(['day', 'week', 'month', 'year']), {
        defaultValue: 'month'
      })
      .field('interval_value', Seq.INTEGER, {
        defaultValue: 1,
        allowNull: false
      })
      .field('is_active', Seq.BOOLEAN, {
        defaultValue: true
      });

    modelObj
      .index('level', {
        unique: true
      });
  };
};