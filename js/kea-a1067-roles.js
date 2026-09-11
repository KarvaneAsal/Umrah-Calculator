/*
 * Karvan-e-Asal A1.0.67 — Users, Roles & Permissions Architecture
 * GitHub module; persists only inside the existing user/profile payload.
 * No Supabase schema changes are required by this module.
 */
(function(){
  'use strict';
  const VERSION='A1.0.67';
  const ROLES={
    superadmin:{label:'Super Admin',pages:{bookings:true,records:true,sales:true,settings:true}},
    admin:{label:'Administrator',pages:{bookings:true,records:true,sales:true,settings:true}},
    manager:{label:'Manager',pages:{bookings:true,records:true,sales:true,settings:false}},
    staff:{label:'Staff',pages:{bookings:true,records:true,sales:false,settings:false}}
  };
  function normalizeRole(value){
    const r=String(value||'staff').toLowerCase().trim().replace(/[._-]+/g,' ');
    if(['superadmin','super admin'].includes(r))return 'superadmin';
    if(['admin','administrator'].includes(r))return 'admin';
    if(r==='manager')return 'manager';
    return 'staff';
  }
  function roleOf(user){return normalizeRole(user?.role);}
  function permissionsOf(user){
    const role=roleOf(user), base=Object.assign({},ROLES[role].pages);
    if(role==='superadmin')return base;
    const custom=user?.permissions;
    return custom&&typeof custom==='object'?Object.assign(base,custom):base;
  }
  const ACTIONS={
    manageUsers:['superadmin'],
    editCatalog:['superadmin','admin'],
    deleteRecords:['superadmin','admin'],
    editOwnRecords:['superadmin','admin','manager','staff'],
    changeLifecycle:['superadmin','admin','manager'],
    viewSales:['superadmin','admin','manager'],
    manageSettings:['superadmin','admin']
  };
  function can(user,action){
    if(!user||user.active===false)return false;
    const role=roleOf(user);
    if(role==='superadmin')return true;
    return (ACTIONS[action]||[]).includes(role);
  }
  function setRole(user,role){
    if(!user||!ROLES[normalizeRole(role)])throw new Error('Invalid role.');
    user.role=normalizeRole(role);
    if(user.role==='superadmin')user.permissions=Object.assign({},ROLES.superadmin.pages);
    return user;
  }
  function roleLabel(role){return ROLES[normalizeRole(role)]?.label||'Staff';}
  window.KEA_ROLES={version:VERSION,roles:ROLES,actions:ACTIONS,normalizeRole,roleOf,permissionsOf,can,setRole,roleLabel};
  window.keaRoleCan=function(action){return can(window.currentUser,action);};
  window.keaRoleLabel=function(role){return roleLabel(role);};
  window.PHASE1_A1067={version:VERSION,feature:'users roles permissions architecture',architecture:'github+supabase',schemaChanges:false};
})();
