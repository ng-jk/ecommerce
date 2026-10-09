namespace Commerce

/-- Serialized gateway/worker snapshot, indexed by shop then package.
    `grants` combines current principal/account/role and capability authorization.
    Hashes are abstract identifiers: cryptographic collision resistance, trusted
    authentication, ZIP validation, SQL transactions/locks, browser isolation and
    the refinement to PHP/TypeScript are assumptions, not conclusions here.
    A successful call adds one abstract effect. Package upload, approval and
    installation lifecycle transitions are outside this dispatch model. -/
structure MiniInstallation where
  installed : Bool
  enabled : Bool
  approved : Bool
  packageHash : Nat
  approvalGeneration : Nat
  generation : Nat
  grants : Nat → Nat → Bool
  effects : Nat

abbrev MiniState := Nat → Nat → MiniInstallation

structure MiniRequest where
  shop : Nat
  app : Nat
  principal : Nat
  capability : Nat
  targetShop : Nat
  packageHash : Nat
  approvalGeneration : Nat
  generation : Nat
  authenticated : Bool

def miniAllowed (s : MiniState) (c : MiniRequest) : Prop :=
  c.authenticated = true ∧ c.targetShop = c.shop ∧
  (s c.shop c.app).installed = true ∧
  (s c.shop c.app).enabled = true ∧
  (s c.shop c.app).approved = true ∧
  c.packageHash = (s c.shop c.app).packageHash ∧
  c.approvalGeneration = (s c.shop c.app).approvalGeneration ∧
  c.generation = (s c.shop c.app).generation ∧
  (s c.shop c.app).grants c.principal c.capability = true

instance (s : MiniState) (c : MiniRequest) : Decidable (miniAllowed s c) := by
  unfold miniAllowed
  infer_instance

def miniStep (s : MiniState) (c : MiniRequest) : MiniState :=
  if miniAllowed s c then
    fun shop app => if shop = c.shop ∧ app = c.app then
      { s shop app with effects := (s shop app).effects + 1 }
    else s shop app
  else s

def miniRun (s : MiniState) (commands : List MiniRequest) : MiniState :=
  commands.foldl miniStep s

theorem mini_denied_unchanged (s : MiniState) (c : MiniRequest)
    (denied : ¬ miniAllowed s c) : miniStep s c = s := by
  simp [miniStep, denied]

theorem mini_unauthenticated_denied (s : MiniState) (c : MiniRequest)
    (h : c.authenticated = false) : ¬ miniAllowed s c := by
  simp [miniAllowed, h]

theorem mini_foreign_target_denied (s : MiniState) (c : MiniRequest)
    (h : c.targetShop ≠ c.shop) : ¬ miniAllowed s c := by
  simp [miniAllowed, h]

theorem mini_uninstalled_denied (s : MiniState) (c : MiniRequest)
    (h : (s c.shop c.app).installed = false) : ¬ miniAllowed s c := by
  simp [miniAllowed, h]

theorem mini_disabled_denied (s : MiniState) (c : MiniRequest)
    (h : (s c.shop c.app).enabled = false) : ¬ miniAllowed s c := by
  simp [miniAllowed, h]

theorem mini_unapproved_denied (s : MiniState) (c : MiniRequest)
    (h : (s c.shop c.app).approved = false) : ¬ miniAllowed s c := by
  simp [miniAllowed, h]

theorem mini_package_mismatch_denied (s : MiniState) (c : MiniRequest)
    (h : c.packageHash ≠ (s c.shop c.app).packageHash) : ¬ miniAllowed s c := by
  simp [miniAllowed, h]

theorem mini_stale_generation_denied (s : MiniState) (c : MiniRequest)
    (h : c.generation ≠ (s c.shop c.app).generation) : ¬ miniAllowed s c := by
  simp [miniAllowed, h]

/-- Reapproval of the same bytes cannot revive launches predating revocation. -/
theorem mini_stale_approval_denied (s : MiniState) (c : MiniRequest)
    (h : c.approvalGeneration ≠ (s c.shop c.app).approvalGeneration) :
    ¬ miniAllowed s c := by
  simp [miniAllowed, h]

theorem mini_revoked_denied (s : MiniState) (c : MiniRequest)
    (h : (s c.shop c.app).grants c.principal c.capability = false) :
    ¬ miniAllowed s c := by
  simp [miniAllowed, h]

/-- Earlier acceptance confers no authority after a grant is revoked. -/
theorem mini_accepted_then_revoked_unchanged (accepted current : MiniState)
    (c : MiniRequest) (_wasAllowed : miniAllowed accepted c)
    (revoked : (current c.shop c.app).grants c.principal c.capability = false) :
    ¬ miniAllowed current c ∧ miniStep current c = current := by
  have denied := mini_revoked_denied current c revoked
  exact ⟨denied, mini_denied_unchanged current c denied⟩

/-- Decisions depend only on the addressed installation and authenticated request;
    foreign tenants' configurations, grants and data cannot affect the result. -/
theorem mini_authorization_noninterference (s t : MiniState) (c : MiniRequest)
    (same : s c.shop c.app = t c.shop c.app) :
    miniAllowed s c ↔ miniAllowed t c := by
  simp [miniAllowed, same]

theorem mini_other_installation_unchanged (s : MiniState) (c : MiniRequest)
    (shop app : Nat) (other : shop ≠ c.shop ∨ app ≠ c.app) :
    miniStep s c shop app = s shop app := by
  have distinct : ¬ (shop = c.shop ∧ app = c.app) := by
    intro same
    rcases other with h | h
    · exact h same.1
    · exact h same.2
  unfold miniStep
  split <;> simp [distinct]

theorem mini_other_dispatch_preserves_authorization (s : MiniState)
    (write query : MiniRequest)
    (other : query.shop ≠ write.shop ∨ query.app ≠ write.app) :
    miniAllowed (miniStep s write) query ↔ miniAllowed s query := by
  apply mini_authorization_noninterference
  exact mini_other_installation_unchanged s write query.shop query.app other

theorem mini_sequences_preserve_other_installation (commands : List MiniRequest)
    (s : MiniState) (shop app : Nat)
    (other : ∀ c ∈ commands, shop ≠ c.shop ∨ app ≠ c.app) :
    miniRun s commands shop app = s shop app := by
  induction commands generalizing s with
  | nil => rfl
  | cons c rest ih =>
    have hc := other c (by simp)
    have hr : ∀ d ∈ rest, shop ≠ d.shop ∨ app ≠ d.app := by
      intro d hd
      exact other d (by simp [hd])
    simpa [miniRun, List.foldl] using
      Eq.trans (ih (miniStep s c) hr)
        (mini_other_installation_unchanged s c shop app hc)

theorem mini_accepted_adds_effect (s : MiniState) (c : MiniRequest)
    (allowed : miniAllowed s c) :
    (miniStep s c c.shop c.app).effects = (s c.shop c.app).effects + 1 := by
  simp [miniStep, allowed]

#print axioms mini_denied_unchanged
#print axioms mini_unauthenticated_denied
#print axioms mini_foreign_target_denied
#print axioms mini_uninstalled_denied
#print axioms mini_disabled_denied
#print axioms mini_unapproved_denied
#print axioms mini_package_mismatch_denied
#print axioms mini_stale_generation_denied
#print axioms mini_stale_approval_denied
#print axioms mini_revoked_denied
#print axioms mini_accepted_then_revoked_unchanged
#print axioms mini_authorization_noninterference
#print axioms mini_other_installation_unchanged
#print axioms mini_other_dispatch_preserves_authorization
#print axioms mini_sequences_preserve_other_installation
#print axioms mini_accepted_adds_effect

end Commerce
