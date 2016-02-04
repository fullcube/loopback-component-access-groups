# Loopback Component Access

This loopback component enables you to add multi-tenant style access controls to a loopback application. It enables you
to restrict access to model data based on a users roles within a specific context.

# Usage

**Installation**

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

**Configuration**

Options:

- `userModel`

  [String] : The name of the user model. *(default: 'User')*

- `roleModel`

  [String] : The name of the model that should be used to register group access role resolvers. *(default: 'Role')*

- `groupModel`

  [String] : The name of the model that should be used to store and check group access roles. *(default: 'AccessGroup')*

- `groupModels`

  [Array] : A list of models that should be considered as group models. *(default: [ ])*

- `foreignKey`

  [String] : The foreign key that should be used to determine which access group a model belongs to. *(default: 'groupId')*

- `accessGroups`

  [Array] : A list of group names. *(default: [ '$group:admin', '$group:member' ])*

# Tests

### Roles

**everyone**
  nothing

**authenticated**
  nothing

**$group:admin**
  create, read, update, delete

**$group:manager**
  create, read, update, delete

**$group:member**
  create, read, update
