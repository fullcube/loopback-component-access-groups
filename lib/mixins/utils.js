'use strict';

const loopback = require('loopback');
const debug = require('debug')('loopback:componenet:access');

module.exports = function utilsMixin(Model) {
  Model.getCurrentuser = function getCurrentuser(cb) {
    const ctx = loopback.getCurrentContext();
    const currentUser = ctx && ctx.get('currentUser');
    let res = true;

    if (!ctx) {
      // this means its a server-side logic call w/o any HTTP req/resp aspect to it
      debug(`inside ${Model.definition.name}.${getCurrentuser()} - no loopback context`);
      res = true;
    }
    else if (currentUser) {
      debug(`inside ${Model.definition.name}.${getCurrentuser()} - currentUser: %o`, currentUser.username);

      res = Promise.promisifyAll(currentUser, {
        filter: name => !(name === 'validate')
      });
    }
    else {
      // TODO: when used with core invocations, the call stack can end up here
      //       this error only makes sense to point out failures in RESTful calls
      //       how can this sanity check be made any better?
      console.error('ctx:', ctx);
      console.error('currentUser:', currentUser);
      return cb('401 - unauthorized - how did we end up here? should we be managing ACL access to remote methods?');
    }
    return res;
  };
};
