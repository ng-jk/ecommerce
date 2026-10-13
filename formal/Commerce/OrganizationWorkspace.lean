import Commerce.OrganizationAccess

namespace Commerce

/-- A single workspace aggregate, not a database. Natural-number versions do not
    model SQL integer overflow. Names have already passed server normalization. -/
structure Workspace where
  id : Nat
  code : String
  name : String
  version : Nat
  active : Bool
  deriving DecidableEq

/-- Trusted execution-time inputs. Authentication, row existence/deletion,
    isolation and locking establish these inputs outside this model. -/
structure WorkspaceAuthority where
  principalActive : Bool
  membershipActive : Bool
  role : OrganizationRole
  frameworkAvailable : Bool
  frameworkInstalled : Bool
  deriving DecidableEq

structure WorkspaceRename where
  target : Nat
  name : String
  nameValid : Bool
  expectedVersion : Nat
  authority : WorkspaceAuthority
  deriving DecidableEq

def workspaceAuthorized (s : Workspace) (c : WorkspaceRename) : Prop :=
  c.target = s.id ∧ s.active = true ∧
  c.authority.principalActive = true ∧
  c.authority.membershipActive = true ∧ c.authority.role = .owner ∧
  c.authority.frameworkAvailable = true ∧ c.authority.frameworkInstalled = true

instance (s : Workspace) (c : WorkspaceRename) :
    Decidable (workspaceAuthorized s c) := by
  unfold workspaceAuthorized
  infer_instance

def workspaceRenameAllowed (s : Workspace) (c : WorkspaceRename) : Prop :=
  workspaceAuthorized s c ∧ c.nameValid = true ∧ c.expectedVersion = s.version

instance (s : Workspace) (c : WorkspaceRename) :
    Decidable (workspaceRenameAllowed s c) := by
  unfold workspaceRenameAllowed
  infer_instance

def workspaceRenameStep (s : Workspace) (c : WorkspaceRename) : Workspace :=
  if workspaceRenameAllowed s c then
    { s with name := c.name, version := s.version + 1 }
  else s

def workspaceRenameRun (s : Workspace) (commands : List WorkspaceRename) : Workspace :=
  commands.foldl workspaceRenameStep s

theorem workspace_rename_rejected_unchanged (s : Workspace) (c : WorkspaceRename)
    (denied : ¬ workspaceRenameAllowed s c) : workspaceRenameStep s c = s := by
  simp [workspaceRenameStep, denied]

theorem workspace_rename_unauthorized_unchanged (s : Workspace) (c : WorkspaceRename)
    (denied : ¬ workspaceAuthorized s c) : workspaceRenameStep s c = s := by
  simp [workspaceRenameStep, workspaceRenameAllowed, denied]

theorem workspace_rename_nonowner_unchanged (s : Workspace) (c : WorkspaceRename)
    (nonowner : c.authority.role ≠ .owner) : workspaceRenameStep s c = s := by
  simp [workspaceRenameStep, workspaceRenameAllowed, workspaceAuthorized, nonowner]

theorem workspace_rename_revoked_unchanged (s : Workspace) (c : WorkspaceRename)
    (revoked : c.authority.membershipActive = false) : workspaceRenameStep s c = s := by
  simp [workspaceRenameStep, workspaceRenameAllowed, workspaceAuthorized, revoked]

theorem workspace_rename_inactive_unchanged (s : Workspace) (c : WorkspaceRename)
    (inactive : s.active = false) : workspaceRenameStep s c = s := by
  simp [workspaceRenameStep, workspaceRenameAllowed, workspaceAuthorized, inactive]

theorem workspace_rename_uninstalled_unchanged (s : Workspace) (c : WorkspaceRename)
    (uninstalled : c.authority.frameworkInstalled = false) :
    workspaceRenameStep s c = s := by
  simp [workspaceRenameStep, workspaceRenameAllowed, workspaceAuthorized, uninstalled]

theorem workspace_rename_stale_unchanged (s : Workspace) (c : WorkspaceRename)
    (stale : c.expectedVersion ≠ s.version) : workspaceRenameStep s c = s := by
  simp [workspaceRenameStep, workspaceRenameAllowed, stale]

theorem workspace_rename_success (s : Workspace) (c : WorkspaceRename)
    (allowed : workspaceRenameAllowed s c) :
    (workspaceRenameStep s c).name = c.name ∧
    (workspaceRenameStep s c).version = s.version + 1 := by
  simp [workspaceRenameStep, allowed]

theorem workspace_rename_replay_unchanged (s : Workspace) (c : WorkspaceRename)
    (allowed : workspaceRenameAllowed s c) :
    workspaceRenameStep (workspaceRenameStep s c) c = workspaceRenameStep s c := by
  apply workspace_rename_stale_unchanged
  rw [(workspace_rename_success s c allowed).2, allowed.2.2]
  omega

theorem workspace_rename_preserves_identity (s : Workspace) (c : WorkspaceRename) :
    (workspaceRenameStep s c).id = s.id ∧ (workspaceRenameStep s c).code = s.code := by
  unfold workspaceRenameStep
  split <;> simp

theorem workspace_rename_sequences_preserve_identity
    (commands : List WorkspaceRename) (s : Workspace) :
    (workspaceRenameRun s commands).id = s.id ∧
    (workspaceRenameRun s commands).code = s.code := by
  induction commands generalizing s with
  | nil => simp [workspaceRenameRun]
  | cons c rest ih =>
    have tail := ih (workspaceRenameStep s c)
    have step := workspace_rename_preserves_identity s c
    exact ⟨tail.1.trans step.1, tail.2.trans step.2⟩

/-- Every command is denied against the initial snapshot; because each is a
    no-op, that snapshot also remains current for this complete finite run. -/
theorem workspace_unauthorized_sequences_unchanged
    (commands : List WorkspaceRename) (s : Workspace)
    (denied : ∀ c ∈ commands, ¬ workspaceAuthorized s c) :
    workspaceRenameRun s commands = s := by
  induction commands with
  | nil => rfl
  | cons c rest ih =>
    have step := workspace_rename_unauthorized_unchanged s c (denied c (by simp))
    have tail : ∀ d ∈ rest, ¬ workspaceAuthorized s d := by
      intro d hd
      exact denied d (by simp [hd])
    simpa [workspaceRenameRun, List.foldl, step] using ih tail

/-- Fresh ID and code uniqueness are trusted database preconditions. This model
    packages an atomic result; it does not prove transactions or SQL constraints. -/
structure WorkspaceCreate where
  id : Nat
  code : String
  name : String
  principal : Nat
  principalActive : Bool
  frameworkAvailable : Bool
  freshId : Bool
  uniqueCode : Bool
  inputValid : Bool

structure WorkspaceCreated where
  workspace : Workspace
  owner : Nat
  membershipRole : OrganizationRole
  membershipActive : Bool
  frameworkInstalled : Bool
  deriving DecidableEq

def workspaceCreateAllowed (c : WorkspaceCreate) : Prop :=
  c.principalActive = true ∧ c.frameworkAvailable = true ∧
  c.freshId = true ∧ c.uniqueCode = true ∧ c.inputValid = true

instance (c : WorkspaceCreate) : Decidable (workspaceCreateAllowed c) := by
  unfold workspaceCreateAllowed
  infer_instance

def workspaceCreate (c : WorkspaceCreate) : Option WorkspaceCreated :=
  if workspaceCreateAllowed c then
    some { workspace := { id := c.id, code := c.code, name := c.name,
                          version := 0, active := true },
           owner := c.principal, membershipRole := .owner,
           membershipActive := true, frameworkInstalled := true }
  else none

theorem workspace_create_denied_no_result (c : WorkspaceCreate)
    (denied : ¬ workspaceCreateAllowed c) : workspaceCreate c = none := by
  simp [workspaceCreate, denied]

theorem workspace_create_success_bundle (c : WorkspaceCreate)
    (allowed : workspaceCreateAllowed c) :
    workspaceCreate c = some {
      workspace := { id := c.id, code := c.code, name := c.name, version := 0, active := true },
      owner := c.principal, membershipRole := .owner,
      membershipActive := true, frameworkInstalled := true } := by
  simp [workspaceCreate, allowed]

theorem workspace_create_duplicate_denied (c : WorkspaceCreate)
    (duplicate : c.freshId = false ∨ c.uniqueCode = false) :
    workspaceCreate c = none := by
  rcases duplicate with h | h <;> simp [workspaceCreate, workspaceCreateAllowed, h]

#print axioms workspace_rename_rejected_unchanged
#print axioms workspace_rename_unauthorized_unchanged
#print axioms workspace_rename_nonowner_unchanged
#print axioms workspace_rename_revoked_unchanged
#print axioms workspace_rename_inactive_unchanged
#print axioms workspace_rename_uninstalled_unchanged
#print axioms workspace_rename_stale_unchanged
#print axioms workspace_rename_success
#print axioms workspace_rename_replay_unchanged
#print axioms workspace_rename_preserves_identity
#print axioms workspace_rename_sequences_preserve_identity
#print axioms workspace_unauthorized_sequences_unchanged
#print axioms workspace_create_denied_no_result
#print axioms workspace_create_success_bundle
#print axioms workspace_create_duplicate_denied

end Commerce
