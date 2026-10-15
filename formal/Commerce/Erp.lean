namespace Commerce

/-- One journal entry with amounts bounded to 0..100 and version bounded to 0..3.
    SQL locks, UTC dates, multi-line totals, tenant lookup, validation and PHP
    correspondence are external assumptions. This model covers only one balanced
    aggregate transition and its opposing reversal. -/
structure ErpEntry where
  tenant : Fin 4
  debit : Fin 101
  credit : Fin 101
  version : Fin 4
  posted : Bool
  reversed : Bool
  deriving DecidableEq

structure ErpRequest where
  tenant : Fin 4
  authorized : Bool
  expectedVersion : Fin 4
  deriving DecidableEq

def erpPost (s : ErpEntry) (r : ErpRequest) : ErpEntry :=
  if h : r.authorized = true ∧ r.tenant = s.tenant ∧ r.expectedVersion = s.version ∧
      s.posted = false ∧ s.debit = s.credit ∧ s.debit.val > 0 ∧ s.version.val < 3 then
    { s with posted := true, version := ⟨s.version.val + 1, by omega⟩ }
  else s

def erpReverse (s : ErpEntry) (r : ErpRequest) : Option (ErpEntry × ErpEntry) :=
  if r.authorized = true ∧ r.tenant = s.tenant ∧ r.expectedVersion = s.version ∧
      s.posted = true ∧ s.reversed = false ∧ s.debit = s.credit then
    some ({ s with reversed := true },
      { tenant := s.tenant, debit := s.credit, credit := s.debit,
        version := 0, posted := true, reversed := false })
  else none

theorem erp_denied_post_unchanged (s : ErpEntry) (r : ErpRequest)
    (denied : r.authorized = false) : erpPost s r = s := by
  simp [erpPost, denied]

theorem erp_stale_post_unchanged (s : ErpEntry) (r : ErpRequest)
    (stale : r.expectedVersion ≠ s.version) : erpPost s r = s := by
  simp [erpPost, stale]

theorem erp_duplicate_post_unchanged (s : ErpEntry) (r : ErpRequest)
    (posted : s.posted = true) : erpPost s r = s := by
  simp [erpPost, posted]

theorem erp_unbalanced_post_unchanged (s : ErpEntry) (r : ErpRequest)
    (unbalanced : s.debit ≠ s.credit) : erpPost s r = s := by
  simp [erpPost, unbalanced]

theorem erp_successful_post_balanced (s : ErpEntry) (r : ErpRequest)
    (balanced : s.debit = s.credit) : (erpPost s r).debit = (erpPost s r).credit := by
  unfold erpPost
  split <;> simp_all

theorem erp_reversal_preserves_original_and_cancels (s original reverse : ErpEntry)
    (r : ErpRequest) (h : erpReverse s r = some (original, reverse)) :
    original.debit = s.debit ∧ original.credit = s.credit ∧
    reverse.debit = s.credit ∧ reverse.credit = s.debit ∧
    ((reverse.debit.val : Int) - reverse.credit.val) =
      -((s.debit.val : Int) - s.credit.val) := by
  unfold erpReverse at h
  split at h
  · cases h
    simp
    omega
  · contradiction

theorem erp_duplicate_reversal_rejected (s : ErpEntry) (r : ErpRequest)
    (reversed : s.reversed = true) : erpReverse s r = none := by
  simp [erpReverse, reversed]

#print axioms erp_denied_post_unchanged
#print axioms erp_stale_post_unchanged
#print axioms erp_duplicate_post_unchanged
#print axioms erp_unbalanced_post_unchanged
#print axioms erp_successful_post_balanced
#print axioms erp_reversal_preserves_original_and_cancels
#print axioms erp_duplicate_reversal_rejected

end Commerce
