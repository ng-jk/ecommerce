namespace Commerce
structure State where
  shop : Nat
  stock : Nat
  sold : Nat
  processed : List Nat
  deriving DecidableEq
structure Purchase where
  shop : Nat
  key : Nat
  quantity : Nat
  authorized : Bool
  deriving DecidableEq

def purchase (state : State) (command : Purchase) : State :=
  if command.authorized = true ∧ command.shop = state.shop ∧
      command.key ∉ state.processed ∧ command.quantity ≤ state.stock then
    { state with stock := state.stock - command.quantity,
                 sold := state.sold + command.quantity,
                 processed := command.key :: state.processed }
  else state

def run (state : State) (commands : List Purchase) : State :=
  commands.foldl purchase state

def total (subtotal shipping : Nat) : Nat := subtotal + shipping

inductive Kind where | main | temp deriving DecidableEq
structure Screen where
  id : Nat
  kind : Kind
  deriving DecidableEq

def fallback : Screen := ⟨0, Kind.main⟩
def back : List Screen → Screen
  | [] => fallback
  | screen :: rest => if screen.kind = Kind.main then screen else back rest

inductive OrderStatus where
  | placed | processing | shipped | completed
  deriving DecidableEq

def rank : OrderStatus → Nat
  | .placed => 0 | .processing => 1 | .shipped => 2 | .completed => 3

def advance (current requested : OrderStatus) (authorized : Bool) : OrderStatus :=
  if authorized = true ∧ rank requested = rank current + 1 then requested else current
end Commerce
