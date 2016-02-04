# Loopback Component Group Access

This loopback component enables you to add multi-tenant style access controls to a loopback application. It enables you to restrict access to model data based on a users roles within a specific context.

### Installation

1. Install in you loopback project:

  `npm install --save loopback-component-access`

2. Create a component-config.json file in your server folder (if you don't already have one)

3. Configure options inside `component-config.json`. *(see configuration section)*

  ```json
  {
    "loopback-component-access": {
      "{option}": "{value}"
    }
  }
  ```

4. Create a middleware.json file in your server folder (if you don't already have one).

5. Enable the `loopback#context`, `loopback#token` and `user-context` middleware.

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

In order to use this component you will need to create group access model that can be used to link users to groups and assign group roles. A user can have have multiple roles within the context of a group and each role can define different access grants to REST resources. The *Group Access Model* must have the following three properties:

 - userId
 - groupId (configurable foreign key)
 - role

Additionally you will need to designate one of your models the *Group Model*. This model will act as parent or container for related group content.

Any other models that have a belongsTo relationship to your Group Model will be considered as Group Content. Access grants for Group Content is determined by the user's roles within the context of the group as defined in the Group Access Model.

For example:

 - **Group Model:** Store (id, name, desxription)
 - **Group Access Model:** StoreUsers (userid, storeId, role)
 - **Group Content Models:** Product, Invoice, Transaction, etc.

You can have multiple stores.
Each store can have multiple StoreUsers.
Each StoreUser can have one or more Store Roles (eg, store manager, store administrator).
Only Store Managers of Store A can create and edit products for Store A.
Only Store Managers of Store B can create and edit products for Store B.
Only Store Administrators of Store A can download transaction details for Store A.
Only Store Administrators of Store B can download transaction details for Store B.
etc.

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

### Roles

The following group roles roles are configured in the test data.

 - **everyone**  
none

 - **authenticated**  
none

 - **$group:member**  
read

 - **$group:manager**  
create, read, update

 - **$group:admin**  
create, read, update, delete
