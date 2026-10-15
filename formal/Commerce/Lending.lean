namespace Commerce

/-- Scoped model of a submitted Lending application: bounded principals and rates,
    four actors/tenants and versions. Central authority, local SQL lock order,
    calendar validation and correspondence to PHP are external assumptions.
    Approval is workflow approval only, with no payout or compliance assertion. -/
structure LendingTerms where
  principal : Fin 9
  numerator : Fin 4
  denominator : Fin 4
  installments : Fin 4
  deriving DecidableEq

structure LendingApplication where
  tenant : Fin 4
  applicant : Fin 4
  version : Fin 4
  submitted : Bool
  approved : Bool
  terms : LendingTerms
  deriving DecidableEq

structure LendingDecision where
  tenant : Fin 4
  actor : Fin 4
  version : Fin 4
  authorized : Bool
  productActive : Bool
  dueDateValid : Bool
  deriving DecidableEq

def lendingApprove (s : LendingApplication) (r : LendingDecision) : LendingApplication :=
  if h : r.authorized = true ∧ r.tenant = s.tenant ∧ r.actor ≠ s.applicant ∧
      r.version = s.version ∧ s.submitted = true ∧ s.approved = false ∧
      r.productActive = true ∧ r.dueDateValid = true ∧ s.version.val < 3 then
    { s with approved := true, version := ⟨s.version.val + 1, by omega⟩ }
  else s

def lendingAllocation (total count : Nat) : List Nat :=
  (List.range count).map (fun index => total / count + if index < total % count then 1 else 0)

def lendingCharge (t : LendingTerms) : Nat :=
  (t.principal.val * t.numerator.val + t.denominator.val) / (t.denominator.val + 1)

theorem lending_denied_unchanged (s : LendingApplication) (r : LendingDecision)
    (denied : r.authorized = false) : lendingApprove s r = s := by
  simp [lendingApprove, denied]

theorem lending_self_approval_unchanged (s : LendingApplication) (r : LendingDecision)
    (self : r.actor = s.applicant) : lendingApprove s r = s := by
  simp [lendingApprove, self]

theorem lending_stale_unchanged (s : LendingApplication) (r : LendingDecision)
    (stale : r.version ≠ s.version) : lendingApprove s r = s := by
  simp [lendingApprove, stale]

theorem lending_terminal_replay_unchanged (s : LendingApplication) (r : LendingDecision)
    (approved : s.approved = true) : lendingApprove s r = s := by
  simp [lendingApprove, approved]

theorem lending_disabled_product_unchanged (s : LendingApplication) (r : LendingDecision)
    (disabled : r.productActive = false) : lendingApprove s r = s := by
  simp [lendingApprove, disabled]

theorem lending_approval_preserves_terms (s : LendingApplication) (r : LendingDecision) :
    (lendingApprove s r).terms = s.terms := by
  unfold lendingApprove
  split <;> rfl

theorem lending_bounded_allocation_conserves (principal : Fin 9) (count : Fin 4) :
    (lendingAllocation principal.val (count.val + 1)).sum = principal.val := by
  have all : ∀ (p : Fin 9) (n : Fin 4),
      (lendingAllocation p.val (n.val + 1)).sum = p.val := by decide
  exact all principal count

theorem lending_bounded_charge_is_ceiling (terms : LendingTerms) :
    lendingCharge terms * (terms.denominator.val + 1) ≥ terms.principal.val * terms.numerator.val ∧
    lendingCharge terms * (terms.denominator.val + 1) <
      terms.principal.val * terms.numerator.val + terms.denominator.val + 1 := by
  have all : ∀ (p : Fin 9) (n d : Fin 4),
      ((p.val * n.val + d.val) / (d.val + 1)) * (d.val + 1) ≥ p.val * n.val ∧
      ((p.val * n.val + d.val) / (d.val + 1)) * (d.val + 1) < p.val * n.val + d.val + 1 := by decide
  exact all terms.principal terms.numerator terms.denominator

#print axioms lending_denied_unchanged
#print axioms lending_self_approval_unchanged
#print axioms lending_stale_unchanged
#print axioms lending_terminal_replay_unchanged
#print axioms lending_disabled_product_unchanged
#print axioms lending_approval_preserves_terms
#print axioms lending_bounded_allocation_conserves
#print axioms lending_bounded_charge_is_ceiling

end Commerce
