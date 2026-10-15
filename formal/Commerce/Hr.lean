import Std.Tactic

namespace Commerce

-- Guards model one employee-locked worker snapshot. Calendar parsing, identity
-- authentication, SQL locking and elapsed time are implementation assumptions.
structure HrLeave where
  employeeActor : Nat
  version : Nat
  pending : Bool
  employeeActive : Bool
  approved : Bool
  deriving DecidableEq

structure HrDecision where
  authorized : Bool
  actor : Nat
  expectedVersion : Nat
  approve : Bool

def hrDecide (s : HrLeave) (r : HrDecision) : HrLeave :=
  if r.authorized = true ∧ r.expectedVersion = s.version ∧ s.pending = true ∧
      (r.approve = false ∨ (s.employeeActive = true ∧ r.actor ≠ s.employeeActor)) then
    { s with version := s.version + 1, pending := false, approved := r.approve }
  else s

theorem hr_denied_unchanged (s : HrLeave) (r : HrDecision)
    (h : r.authorized = false) : hrDecide s r = s := by
  simp [hrDecide, h]

theorem hr_stale_unchanged (s : HrLeave) (r : HrDecision)
    (h : r.expectedVersion ≠ s.version) : hrDecide s r = s := by
  simp [hrDecide, h]

theorem hr_terminal_unchanged (s : HrLeave) (r : HrDecision)
    (h : s.pending = false) : hrDecide s r = s := by
  simp [hrDecide, h]

theorem hr_self_approval_unchanged (s : HrLeave) (r : HrDecision)
    (approve : r.approve = true) (self : r.actor = s.employeeActor) :
    hrDecide s r = s := by
  simp [hrDecide, approve, self]

theorem hr_inactive_approval_unchanged (s : HrLeave) (r : HrDecision)
    (approve : r.approve = true) (inactive : s.employeeActive = false) :
    hrDecide s r = s := by
  simp [hrDecide, approve, inactive]

theorem hr_decision_preserves_employee (s : HrLeave) (r : HrDecision) :
    (hrDecide s r).employeeActor = s.employeeActor := by
  unfold hrDecide
  split <;> rfl

structure HrReservation where
  authorized : Bool
  validCalendar : Bool
  noOverlap : Bool
  days : Nat

def hrReserve (used allowance : Nat) (r : HrReservation) : Nat :=
  if r.authorized = true ∧ r.validCalendar = true ∧ r.noOverlap = true ∧
      1 ≤ r.days ∧ r.days ≤ 31 ∧ used + r.days ≤ allowance then
    used + r.days
  else used

theorem hr_reservation_preserves_allowance (used allowance : Nat) (r : HrReservation)
    (h : used ≤ allowance) : hrReserve used allowance r ≤ allowance := by
  unfold hrReserve
  split <;> simp_all

theorem hr_reservation_sequences_preserve_allowance (requests : List HrReservation)
    (used allowance : Nat) (h : used ≤ allowance) :
    requests.foldl (fun total request => hrReserve total allowance request) used ≤ allowance := by
  induction requests generalizing used with
  | nil => exact h
  | cons request rest ih =>
    exact ih (hrReserve used allowance request) (hr_reservation_preserves_allowance used allowance request h)

#print axioms hr_denied_unchanged
#print axioms hr_stale_unchanged
#print axioms hr_terminal_unchanged
#print axioms hr_self_approval_unchanged
#print axioms hr_inactive_approval_unchanged
#print axioms hr_decision_preserves_employee
#print axioms hr_reservation_preserves_allowance
#print axioms hr_reservation_sequences_preserve_allowance

end Commerce
