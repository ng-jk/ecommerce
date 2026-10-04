namespace Commerce

/-- A serialized worker snapshot. Authentication, SQL locks/atomicity, active target
    lookup, bounded integer parsing and idempotency are implementation assumptions.
    `granted` is the current effective role permission, not the accepted snapshot. -/
structure PluginConfig where
  installed : Bool
  enabled : Bool
  customerEnabled : Bool
  maxCredit : Nat
  deriving DecidableEq

structure PluginShop where
  config : PluginConfig
  points : Nat
  deriving DecidableEq

abbrev PluginState := Nat → PluginShop

inductive PluginAction where
  | configure | balance | credit
  deriving DecidableEq

structure PluginCommand where
  shop : Nat
  targetShop : Nat
  action : PluginAction
  authorized : Bool
  admin : Bool
  granted : Bool
  valid : Bool
  points : Nat
  config : PluginConfig
  deriving DecidableEq

def pluginAllowed (s : PluginState) (c : PluginCommand) : Prop :=
  c.authorized = true ∧ c.valid = true ∧
  match c.action with
  | .configure => c.admin = true
  | .balance => (s c.shop).config.installed = true ∧
      (s c.shop).config.enabled = true ∧ c.granted = true ∧
      c.targetShop = c.shop ∧
      (c.admin = true ∨ (s c.shop).config.customerEnabled = true)
  | .credit => (s c.shop).config.installed = true ∧
      (s c.shop).config.enabled = true ∧ c.granted = true ∧
      c.targetShop = c.shop ∧ c.admin = true ∧
      0 < c.points ∧ c.points ≤ 10000 ∧ c.points ≤ (s c.shop).config.maxCredit ∧
      (s c.shop).points + c.points ≤ 2147483647

instance (s : PluginState) (c : PluginCommand) : Decidable (pluginAllowed s c) := by
  unfold pluginAllowed
  cases c.action <;> infer_instance

def pluginStep (s : PluginState) (c : PluginCommand) : PluginState :=
  if pluginAllowed s c then
    fun shop => if shop = c.shop then
      match c.action with
      | .configure => { s shop with config := c.config }
      | .balance => s shop
      | .credit => { s shop with points := (s shop).points + c.points }
    else s shop
  else s

def pluginRun (s : PluginState) (commands : List PluginCommand) : PluginState :=
  commands.foldl pluginStep s

theorem plugin_invalid_unchanged (s : PluginState) (c : PluginCommand)
    (h : ¬ pluginAllowed s c) : pluginStep s c = s := by
  simp [pluginStep, h]

theorem plugin_unauthorized_unchanged (s : PluginState) (c : PluginCommand)
    (h : c.authorized = false) : pluginStep s c = s := by
  apply plugin_invalid_unchanged
  simp [pluginAllowed, h]

theorem plugin_disabled_blocks_execution (s : PluginState) (c : PluginCommand)
    (action : c.action = .credit) (disabled : (s c.shop).config.enabled = false) :
    pluginStep s c = s := by
  apply plugin_invalid_unchanged
  simp [pluginAllowed, action, disabled]

theorem plugin_revoked_blocks_execution (s : PluginState) (c : PluginCommand)
    (action : c.action = .credit) (revoked : c.granted = false) :
    pluginStep s c = s := by
  apply plugin_invalid_unchanged
  simp [pluginAllowed, action, revoked]

theorem plugin_foreign_target_unchanged (s : PluginState) (c : PluginCommand)
    (action : c.action = .credit) (foreign : c.targetShop ≠ c.shop) :
    pluginStep s c = s := by
  apply plugin_invalid_unchanged
  simp [pluginAllowed, action, foreign]

theorem plugin_customer_revoked_blocks_execution (s : PluginState) (c : PluginCommand)
    (action : c.action = .balance) (customer : c.admin = false)
    (revoked : (s c.shop).config.customerEnabled = false) : pluginStep s c = s := by
  apply plugin_invalid_unchanged
  simp [pluginAllowed, action, customer, revoked]

theorem plugin_customer_revoked_not_allowed (s : PluginState) (c : PluginCommand)
    (action : c.action = .balance) (customer : c.admin = false)
    (revoked : (s c.shop).config.customerEnabled = false) : ¬ pluginAllowed s c := by
  simp [pluginAllowed, action, customer, revoked]

theorem plugin_credit_requires_admin (s : PluginState) (c : PluginCommand)
    (action : c.action = .credit) (customer : c.admin = false) :
    ¬ pluginAllowed s c ∧ pluginStep s c = s := by
  have denied : ¬ pluginAllowed s c := by simp [pluginAllowed, action, customer]
  exact ⟨denied, plugin_invalid_unchanged s c denied⟩

theorem plugin_balance_preserves_business_state (s : PluginState) (c : PluginCommand)
    (action : c.action = .balance) : pluginStep s c = s := by
  funext shop
  simp [pluginStep, action]

theorem plugin_disabled_balance_not_allowed (s : PluginState) (c : PluginCommand)
    (action : c.action = .balance) (disabled : (s c.shop).config.enabled = false) :
    ¬ pluginAllowed s c := by
  simp [pluginAllowed, action, disabled]

theorem plugin_credit_overflow_unchanged (s : PluginState) (c : PluginCommand)
    (action : c.action = .credit) (overflow : 2147483647 < (s c.shop).points + c.points) :
    pluginStep s c = s := by
  apply plugin_invalid_unchanged
  simp [pluginAllowed, action, Nat.not_le.mpr overflow]

theorem plugin_configuration_requires_admin (s : PluginState) (c : PluginCommand)
    (action : c.action = .configure) (customer : c.admin = false) :
    pluginStep s c = s := by
  apply plugin_invalid_unchanged
  simp [pluginAllowed, action, customer]

theorem plugin_other_shop_unchanged (s : PluginState) (c : PluginCommand)
    (shop : Nat) (other : shop ≠ c.shop) : pluginStep s c shop = s shop := by
  unfold pluginStep
  split <;> simp [other]

theorem plugin_other_configuration_unchanged (s : PluginState) (c : PluginCommand)
    (shop : Nat) (other : shop ≠ c.shop) :
    (pluginStep s c shop).config = (s shop).config := by
  rw [plugin_other_shop_unchanged s c shop other]

theorem plugin_sequences_preserve_other_shop (commands : List PluginCommand)
    (s : PluginState) (shop : Nat) (other : ∀ c ∈ commands, shop ≠ c.shop) :
    pluginRun s commands shop = s shop := by
  induction commands generalizing s with
  | nil => rfl
  | cons c rest ih =>
    have hc : shop ≠ c.shop := other c (by simp)
    have hr : ∀ d ∈ rest, shop ≠ d.shop := by
      intro d hd
      exact other d (by simp [hd])
    simpa [pluginRun, List.foldl] using
      Eq.trans (ih (pluginStep s c) hr) (plugin_other_shop_unchanged s c shop hc)

theorem plugin_sequences_preserve_other_configuration (commands : List PluginCommand)
    (s : PluginState) (shop : Nat) (other : ∀ c ∈ commands, shop ≠ c.shop) :
    (pluginRun s commands shop).config = (s shop).config := by
  rw [plugin_sequences_preserve_other_shop commands s shop other]

#print axioms plugin_invalid_unchanged
#print axioms plugin_unauthorized_unchanged
#print axioms plugin_disabled_blocks_execution
#print axioms plugin_revoked_blocks_execution
#print axioms plugin_foreign_target_unchanged
#print axioms plugin_customer_revoked_blocks_execution
#print axioms plugin_customer_revoked_not_allowed
#print axioms plugin_credit_requires_admin
#print axioms plugin_balance_preserves_business_state
#print axioms plugin_disabled_balance_not_allowed
#print axioms plugin_credit_overflow_unchanged
#print axioms plugin_configuration_requires_admin
#print axioms plugin_other_shop_unchanged
#print axioms plugin_other_configuration_unchanged
#print axioms plugin_sequences_preserve_other_shop
#print axioms plugin_sequences_preserve_other_configuration

end Commerce
