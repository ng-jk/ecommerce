import Commerce.Model
namespace Commerce

theorem purchase_preserves_shop (s : State) (c : Purchase) :
    (purchase s c).shop = s.shop := by
  unfold purchase
  split <;> rfl

theorem unauthorized_unchanged (s : State) (c : Purchase)
    (h : c.authorized = false) : purchase s c = s := by
  simp [purchase, h]

theorem foreign_shop_unchanged (s : State) (c : Purchase)
    (h : c.shop ≠ s.shop) : purchase s c = s := by
  simp [purchase, h]

theorem replay_unchanged (s : State) (c : Purchase)
    (h : c.key ∈ s.processed) : purchase s c = s := by
  simp [purchase, h]

theorem purchase_conserves_stock (s : State) (c : Purchase) :
    (purchase s c).stock + (purchase s c).sold = s.stock + s.sold := by
  unfold purchase
  split
  · rename_i h
    simp only
    omega
  · rfl

theorem purchase_idempotent (s : State) (c : Purchase) :
    purchase (purchase s c) c = purchase s c := by
  unfold purchase
  split
  · simp
  · simp

theorem all_sequences_conserve_stock (commands : List Purchase) (s : State) :
    (run s commands).stock + (run s commands).sold = s.stock + s.sold := by
  induction commands generalizing s with
  | nil => rfl
  | cons c rest ih =>
    simpa [run, List.foldl] using Eq.trans (ih (purchase s c)) (purchase_conserves_stock s c)

theorem all_sequences_preserve_shop (commands : List Purchase) (s : State) :
    (run s commands).shop = s.shop := by
  induction commands generalizing s with
  | nil => rfl
  | cons c rest ih =>
    simpa [run, List.foldl] using Eq.trans (ih (purchase s c)) (purchase_preserves_shop s c)

theorem stock_nonnegative (s : State) (c : Purchase) :
    0 ≤ (purchase s c).stock := Nat.zero_le _

theorem money_total_correct (subtotal shipping : Nat) :
    total subtotal shipping - shipping = subtotal := by
  simp [total]

theorem back_never_temp (history : List Screen) : (back history).kind = Kind.main := by
  induction history with
  | nil => rfl
  | cons screen rest ih =>
    simp only [back]
    split
    · assumption
    · exact ih

theorem order_advance_valid (current requested : OrderStatus) (authorized : Bool) :
    advance current requested authorized = current ∨
    (authorized = true ∧ rank (advance current requested authorized) = rank current + 1) := by
  unfold advance
  split
  · rename_i h
    exact Or.inr h
  · exact Or.inl rfl

/-- Deterministic dispatch guard; model output alone cannot authorize an action. -/
def assistantMayExecute (authorized complete confirmed mutating : Bool) : Bool :=
  authorized && complete && (!mutating || confirmed)

theorem assistant_unauthorized_no_execution (complete confirmed mutating : Bool) :
    assistantMayExecute false complete confirmed mutating = false := by
  simp [assistantMayExecute]

theorem assistant_incomplete_no_execution (authorized confirmed mutating : Bool) :
    assistantMayExecute authorized false confirmed mutating = false := by
  simp [assistantMayExecute]

theorem assistant_write_requires_confirmation (authorized complete : Bool) :
    assistantMayExecute authorized complete false true = false := by
  simp [assistantMayExecute]

#print axioms assistant_unauthorized_no_execution
#print axioms assistant_incomplete_no_execution
#print axioms assistant_write_requires_confirmation
#print axioms purchase_conserves_stock
#print axioms purchase_idempotent
#print axioms all_sequences_conserve_stock
#print axioms all_sequences_preserve_shop
#print axioms unauthorized_unchanged
#print axioms foreign_shop_unchanged
#print axioms replay_unchanged
#print axioms stock_nonnegative
#print axioms money_total_correct
#print axioms back_never_temp
#print axioms order_advance_valid

/-- Verified provider state only; authentication, amount and reference checks are
    preconditions implemented by PaymentProcessor.apply and tested separately. -/
inductive PaymentStatus where
  | pending | paid | cancelled
  deriving DecidableEq

def settlePayment (current requested : PaymentStatus) (verified : Bool) : PaymentStatus :=
  if current = .paid ∨ current = .cancelled then current
  else if verified then requested else current

theorem payment_paid_is_terminal (requested : PaymentStatus) (verified : Bool) :
    settlePayment .paid requested verified = .paid := by
  simp [settlePayment]

theorem payment_unverified_unchanged (current requested : PaymentStatus) :
    settlePayment current requested false = current := by
  simp [settlePayment]

def releaseReservation (released : Bool) (stock quantity : Nat) : Bool × Nat :=
  if released then (true, stock) else (true, stock + quantity)

theorem payment_release_is_idempotent (released : Bool) (stock quantity : Nat) :
    let first := releaseReservation released stock quantity
    releaseReservation first.1 first.2 quantity = first := by
  cases released <;> simp [releaseReservation]

#print axioms payment_paid_is_terminal
#print axioms payment_unverified_unchanged
#print axioms payment_release_is_idempotent

end Commerce
