namespace Commerce

/-- A current authorization snapshot. IDs and the action requirement are trusted
    server inputs; authentication, database constraints, and locking are outside
    this model. An absent row is represented explicitly in each status. -/
inductive OrganizationRole where
  | member | admin | owner
  deriving DecidableEq

def organizationRoleRank : OrganizationRole → Nat
  | .member => 0
  | .admin => 1
  | .owner => 2

inductive MembershipStatus where
  | absent | invited | active | revoked
  deriving DecidableEq

inductive InstallationStatus where
  | absent | installed | disabled | revoked
  deriving DecidableEq

structure PrincipalAccess where
  known : Bool
  active : Bool
  deriving DecidableEq

structure OrganizationAccess where
  known : Bool
  active : Bool
  deriving DecidableEq

structure MembershipAccess where
  status : MembershipStatus
  role : OrganizationRole
  deriving DecidableEq

structure ApplicationAccess where
  known : Bool
  available : Bool
  deriving DecidableEq

structure OrganizationAccessState where
  principals : Nat → PrincipalAccess
  organizations : Nat → OrganizationAccess
  memberships : Nat → Nat → MembershipAccess
  applications : Nat → ApplicationAccess
  installations : Nat → Nat → InstallationStatus
  requiredRole : Nat → Nat → OrganizationRole

structure OrganizationRequest where
  principal : Nat
  organization : Nat
  targetOrganization : Nat
  application : Nat
  action : Nat
  claimedRole : OrganizationRole
  deriving DecidableEq

/-- The claimed role is deliberately ignored. The required role comes from the
    current server policy, and the effective role from the current membership. -/
def organizationAllowed (s : OrganizationAccessState)
    (r : OrganizationRequest) : Prop :=
  (s.principals r.principal).known = true ∧
  (s.principals r.principal).active = true ∧
  (s.organizations r.organization).known = true ∧
  (s.organizations r.organization).active = true ∧
  r.targetOrganization = r.organization ∧
  (s.memberships r.organization r.principal).status = .active ∧
  (s.applications r.application).known = true ∧
  (s.applications r.application).available = true ∧
  s.installations r.organization r.application = .installed ∧
  organizationRoleRank (s.requiredRole r.application r.action) ≤
    organizationRoleRank (s.memberships r.organization r.principal).role

instance (s : OrganizationAccessState) (r : OrganizationRequest) :
    Decidable (organizationAllowed s r) := by
  unfold organizationAllowed
  infer_instance

def organizationGuard (s : OrganizationAccessState)
    (r : OrganizationRequest) : Bool :=
  decide (organizationAllowed s r)

theorem organization_guard_iff (s : OrganizationAccessState)
    (r : OrganizationRequest) :
    organizationGuard s r = true ↔ organizationAllowed s r := by
  simp [organizationGuard]

theorem organization_revoked_membership_denied (s : OrganizationAccessState)
    (r : OrganizationRequest)
    (h : (s.memberships r.organization r.principal).status = .revoked) :
    organizationGuard s r = false := by
  have denied : ¬ organizationAllowed s r := by
    intro allowed
    exact MembershipStatus.noConfusion (h.symm.trans allowed.2.2.2.2.2.1)
  simp [organizationGuard, denied]

/-- Prior acceptance does not authorize execution after membership revocation. -/
theorem organization_accepted_then_revoked_denied
    (accepted current : OrganizationAccessState) (r : OrganizationRequest)
    (_wasAllowed : organizationGuard accepted r = true)
    (revoked : (current.memberships r.organization r.principal).status = .revoked) :
    organizationGuard current r = false := by
  exact organization_revoked_membership_denied current r revoked

theorem organization_disabled_principal_denied (s : OrganizationAccessState)
    (r : OrganizationRequest)
    (h : (s.principals r.principal).active = false) :
    organizationGuard s r = false := by
  simp [organizationGuard, organizationAllowed, h]

theorem organization_disabled_installation_denied (s : OrganizationAccessState)
    (r : OrganizationRequest)
    (h : s.installations r.organization r.application = .disabled) :
    organizationGuard s r = false := by
  have denied : ¬ organizationAllowed s r := by
    intro allowed
    exact InstallationStatus.noConfusion (h.symm.trans allowed.2.2.2.2.2.2.2.2.1)
  simp [organizationGuard, denied]

theorem organization_unknown_tenant_denied (s : OrganizationAccessState)
    (r : OrganizationRequest)
    (h : (s.organizations r.organization).known = false) :
    organizationGuard s r = false := by
  simp [organizationGuard, organizationAllowed, h]

theorem organization_cross_tenant_denied (s : OrganizationAccessState)
    (r : OrganizationRequest) (h : r.targetOrganization ≠ r.organization) :
    organizationGuard s r = false := by
  simp [organizationGuard, organizationAllowed, h]

theorem organization_unavailable_application_denied (s : OrganizationAccessState)
    (r : OrganizationRequest)
    (h : (s.applications r.application).available = false) :
    organizationGuard s r = false := by
  simp [organizationGuard, organizationAllowed, h]

theorem organization_unknown_application_denied (s : OrganizationAccessState)
    (r : OrganizationRequest)
    (h : (s.applications r.application).known = false) :
    organizationGuard s r = false := by
  simp [organizationGuard, organizationAllowed, h]

/-- An elevated role in the request cannot grant access when current membership
    has only member authority and the trusted action requires admin authority. -/
theorem organization_claimed_role_cannot_escalate (s : OrganizationAccessState)
    (r : OrganizationRequest)
    (member : (s.memberships r.organization r.principal).role = .member)
    (admin : s.requiredRole r.application r.action = .admin) :
    organizationGuard s r = false := by
  simp [organizationGuard, organizationAllowed, member, admin,
    organizationRoleRank]

theorem organization_claimed_role_irrelevant (s : OrganizationAccessState)
    (r : OrganizationRequest) (role : OrganizationRole) :
    organizationGuard s { r with claimedRole := role } =
      organizationGuard s r := by
  rfl

/-- Access decisions depend only on the addressed principal, organization,
    membership, application, installation, and trusted action policy. -/
theorem organization_guard_isolated (s t : OrganizationAccessState)
    (r : OrganizationRequest)
    (principal : s.principals r.principal = t.principals r.principal)
    (organization : s.organizations r.organization = t.organizations r.organization)
    (membership : s.memberships r.organization r.principal =
      t.memberships r.organization r.principal)
    (application : s.applications r.application = t.applications r.application)
    (installation : s.installations r.organization r.application =
      t.installations r.organization r.application)
    (policy : s.requiredRole r.application r.action =
      t.requiredRole r.application r.action) :
    organizationGuard s r = organizationGuard t r := by
  have same : organizationAllowed s r ↔ organizationAllowed t r := by
    simp only [organizationAllowed, principal, organization, membership,
      application, installation, policy]
  by_cases allowed : organizationAllowed s r
  · simp [organizationGuard, allowed, same.mp allowed]
  · have denied : ¬ organizationAllowed t r := by
      intro h
      exact allowed (same.mpr h)
    simp [organizationGuard, allowed, denied]

#print axioms organization_guard_iff
#print axioms organization_revoked_membership_denied
#print axioms organization_accepted_then_revoked_denied
#print axioms organization_disabled_principal_denied
#print axioms organization_disabled_installation_denied
#print axioms organization_unknown_tenant_denied
#print axioms organization_cross_tenant_denied
#print axioms organization_unavailable_application_denied
#print axioms organization_unknown_application_denied
#print axioms organization_claimed_role_cannot_escalate
#print axioms organization_claimed_role_irrelevant
#print axioms organization_guard_isolated

end Commerce
