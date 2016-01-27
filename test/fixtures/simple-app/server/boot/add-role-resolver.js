const path = require('path');
const fileName = path.basename(__filename, '.js');
const debug = require('debug')(`server:boot:${fileName}`);

module.exports = function(app) {
  const Role = app.models.Role;
  const Team = app.models.Team;

  Role.registerResolver('teamMember', (role, context, cb) => {
    debug('teamMember: context.modelId: %o', context.modelId);

    function reject() {
      debug('teamMember: rejecting');
      process.nextTick(() => cb(null, false));
    }

    // do not allow anonymous users
    const userId = context.accessToken.userId;

    if (!userId) {
      debug('teamMember: no user id');
      return reject();
    }

    // check if userId is in team table for the given project id
    return context.model.findById(context.modelId, function(err, program) {
      if (err || !program) {
        debug(`teamMember: program ${context.modelId} not found`);
        return reject();
      }

      return Team.count({
        programId: program.programId,
        userId
      }, (err, count) => {
        if (err) {
          console.log(err);
          return cb(null, false);
        }
        debug(`teamMember: user ${userId} is a team member of program ${program.programId}`);

         // true = is a team member
        return cb(null, count > 0);
      });
    });
  });
};
