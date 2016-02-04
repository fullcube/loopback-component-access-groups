# Loopback Component Group Access

[![Circle CI](https://circleci.com/gh/fullcube/loopback-component-access-groups.svg?style=svg)](https://circleci.com/gh/fullcube/loopback-component-access-groups) [![Dependencies](http://img.shields.io/david/fullcube/loopback-component-access-groups.svg?style=flat)](https://david-dm.org/fullcube/loopback-component-access-groups) [![Coverage Status](https://coveralls.io/repos/github/fullcube/loopback-component-access-groups/badge.svg?branch=master)](https://coveralls.io/github/fullcube/loopback-component-access-groups?branch=master)

This loopback component enables you to add multi-tenant style access controls to a loopback application. It enables you to restrict access to model data based on a user's roles within a specific context.

There are two types of access restrictions implemented in this component:

**1) Role Resolvers**

For each *Group Role* that you define, a dynamic [Role Resolver](https://docs.strongloop.com/display/public/LB/Defining+and+using+roles#Definingandusingroles-Dynamicroles) is attached to the application. These Role Resolvers are responsible for determining wether or not a user has the relevant roles required to access data that belongs to a group context.


**2) Query Filters**

An 'access' [Operation Hook](https://docs.strongloop.com/display/public/LB/Operation+hooks) is injected into each Group Content model. This is used to filter search results to ensure that only items that a user has access to (based on their Group Roles) are returned.

### Installation

1. Install in you loopback project:

  `npm install --save loopback-component-access-groups`

2. Create a component-config.json file in your server folder (if you don't already have one)

3. Configure options inside `component-config.json`. *(see configuration section)*

  ```json
  {
    "loopback-component-access-groups": {
      "{option}": "{value}"
    }
  }
  ```

4. Create a middleware.json file in your server folder (if you don't already have one).

5. Enable the `loopback#context`, `loopback#token` and `loopback-component-group-access#user-context` middleware.

  ```json
  {
    "initial:before": {
      "loopback#context": {},
      "loopback#token": {},
      "loopback-component-group-access#user-context": {}
    },
  }
  ```

### Usage

**Group Model**

You will need to designate one of your models as the *Group Model*. This model will act as parent or container for related group specific data.

All models that have a belongsTo relationship to your *Group Model* will be considered as Group Content. Access grants for Group Content are determined by a user's roles within the context of its group as defined in the *Group Access Model*.

**Group Roles**

*Group Roles* can be used in ACL definitions to grant or restrict access to api endpoints to specific group roles.

```
{
  "accessType": "READ",
  "principalType": "ROLE",
  "principalId": "$group:member",
  "permission": "ALLOW"
}
```

The above configuration would grant READ access to all users that have the 'member' role within the context of the group that a model instance belongs to.

*Group Roles* can be defined in the component configuration using the `groupRoles` key. *Group Role* names must be prefixed with `$group:` (eg `$group:admin`).

**Group Access Model**

In order to use this component you will need to create *Group Access Model* that can be used to assign roles to users of a Group. A user can have have multiple roles within the context of a group and each role can be associated with different access grants to REST resources. The default schema for the *Group Access Model* is as follows, although this can be overridden through the component configuration options.

- User -> hasMany -> Groups (through GroupAccess)
- Group -> hasMany -> Users (through GroupAccess)
- GroupAccess
  - userId -> belongsTo -> User
  - groupId -> belongsTo -> Group
  - role

### Example

 - **Group Model:** Store (id, name, description)
 - **Group Access Model:** StoreUsers (userid, storeId, role)
 - **Group Content Models:** Product, Invoice, Transaction, etc.
 - **Group Roles:** Store Manager, Store Administrator

- You have multiple stores.
- Each store can have multiple Store Users.
- Each Store User can have one or more Store Roles (eg, Store Manager, Store Administrator).
- Only Store Managers of Store A can create and edit products for Store A.
- Only Store Managers of Store B can create and edit products for Store B.
- Only Store Administrators of Store A can download transaction details for Store A.
- Only Store Administrators of Store B can download transaction details for Store B.

### Configuration

Options:

- `userModel`

  [String] : The name of the user model. *(default: 'User')*

- `roleModel`

  [String] : The name of the model that should be used to register group access role resolvers. *(default: 'Role')*

- `groupModel`

  [String] : The model that is considered as a group. *(default: 'Group')*

- `groupAccessModel`

  [String] : The name of the model that should be used to store and check group access roles. *(default: 'GroupAccess')*

- `groupRoles`

  [Array] : A list of group names. *(default: [ '$group:admin', '$group:member' ])*

- `foreignKey`

  [String] : The foreign key that should be used to determine which access group a model belongs to. *(default: 'groupId')*

## Tests

A sample application is provided in the test directory. This demonstrates how you can integrate the component with a loopback application.

The following group roles roles are configured in the test data.

 - **$group:member**  
read

 - **$group:manager**  
create, read, update

 - **$group:admin**  
create, read, update, delete

There are a number of test user accounts in the sample application.

 - generalUser
  - (no group roles)
 - storeAdminA
  - ($group:admin of Store A)
 - storeManagerA
  - ($group:manager of Store A)
 - storeMemberA
  - ($group:member of Store A)
 - storeAdminB
  - ($group:admin of Store B)
 - storeManagerB
  - ($group:manager of Store B)
 - storeMemberB
  - ($group:member of Store B)
