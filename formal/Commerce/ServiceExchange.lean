namespace Commerce

/-- Durable uniqueness, authenticated receipts, transaction atomicity and trusted
    authorization snapshots are external assumptions, not distributed revocation. -/
structure ServiceInboxState where
  completed : Bool
  lease : Nat
  effects : Nat
  deriving DecidableEq

structure ServiceAttempt where
  lease : Nat
  authorityAllows : Bool
  leaseLive : Bool
  deriving DecidableEq

def serviceInboxStep (s : ServiceInboxState) (a : ServiceAttempt) : ServiceInboxState :=
  if s.completed = false ∧ a.lease = s.lease ∧ a.authorityAllows = true ∧ a.leaseLive = true then
    { s with completed := true, effects := s.effects + 1 }
  else s

def serviceInboxRun (s : ServiceInboxState) (attempts : List ServiceAttempt) : ServiceInboxState :=
  attempts.foldl serviceInboxStep s

theorem service_inbox_revoked_unchanged (s : ServiceInboxState) (a : ServiceAttempt)
    (h : a.authorityAllows = false) : serviceInboxStep s a = s := by
  simp [serviceInboxStep, h]

theorem service_inbox_stale_worker_unchanged (s : ServiceInboxState) (a : ServiceAttempt)
    (h : a.lease ≠ s.lease) : serviceInboxStep s a = s := by
  simp [serviceInboxStep, h]

theorem service_inbox_expired_worker_unchanged (s : ServiceInboxState) (a : ServiceAttempt)
    (h : a.leaseLive = false) : serviceInboxStep s a = s := by
  simp [serviceInboxStep, h]

theorem service_inbox_completed_unchanged (s : ServiceInboxState) (a : ServiceAttempt)
    (h : s.completed = true) : serviceInboxStep s a = s := by
  simp [serviceInboxStep, h]

theorem service_inbox_replay_idempotent (s : ServiceInboxState) (a : ServiceAttempt) :
    serviceInboxStep (serviceInboxStep s a) a = serviceInboxStep s a := by
  unfold serviceInboxStep
  split <;> simp_all

theorem service_inbox_completed_sequences_unchanged (s : ServiceInboxState)
    (attempts : List ServiceAttempt) (h : s.completed = true) : serviceInboxRun s attempts = s := by
  induction attempts with
  | nil => rfl
  | cons a rest ih =>
    simp only [serviceInboxRun, List.foldl_cons]
    rw [service_inbox_completed_unchanged s a h]
    exact ih

theorem service_inbox_success_effect_and_completion (s : ServiceInboxState) (a : ServiceAttempt)
    (ready : s.completed = false) (owner : a.lease = s.lease)
    (allowed : a.authorityAllows = true) (live : a.leaseLive = true) :
    (serviceInboxStep s a).completed = true ∧ (serviceInboxStep s a).effects = s.effects + 1 := by
  simp [serviceInboxStep, ready, owner, allowed, live]

#print axioms service_inbox_revoked_unchanged
#print axioms service_inbox_stale_worker_unchanged
#print axioms service_inbox_expired_worker_unchanged
#print axioms service_inbox_completed_unchanged
#print axioms service_inbox_replay_idempotent
#print axioms service_inbox_completed_sequences_unchanged
#print axioms service_inbox_success_effect_and_completion

/-- Finite single-command abstraction: identifiers, digests and versions each have
    four values. Signature verification, SQL uniqueness, local atomicity and fresh
    authority are external assumptions. This does not verify PHP, TLS or global revocation. -/
structure RemoteProtocolState where
  commandId : Fin 4
  digest : Fin 4
  version : Fin 4
  terminal : Bool
  effect : Bool
  deriving DecidableEq

structure RemoteProtocolAttempt where
  commandId : Fin 4
  digest : Fin 4
  version : Fin 4
  authorized : Bool
  authenticated : Bool
  deadlineLive : Bool
  deriving DecidableEq

def remoteProtocolStep (s : RemoteProtocolState) (a : RemoteProtocolAttempt) : RemoteProtocolState :=
  if s.terminal = false ∧ a.commandId = s.commandId ∧ a.digest = s.digest ∧
      a.version = s.version ∧ a.authorized = true ∧ a.authenticated = true ∧ a.deadlineLive = true then
    { s with terminal := true, effect := true }
  else s

theorem remote_protocol_denied_unchanged (s : RemoteProtocolState) (a : RemoteProtocolAttempt)
    (denied : a.authorized = false) : remoteProtocolStep s a = s := by
  simp [remoteProtocolStep, denied]

theorem remote_protocol_effect_requires_positive_authority (s : RemoteProtocolState) (a : RemoteProtocolAttempt)
    (before : s.effect = false) (after : (remoteProtocolStep s a).effect = true) : a.authorized = true := by
  unfold remoteProtocolStep at after
  split at after <;> simp_all

theorem remote_protocol_duplicate_id_consistent (s : RemoteProtocolState) (a : RemoteProtocolAttempt)
    (sameId : a.commandId = s.commandId) (changedBody : a.digest ≠ s.digest) : remoteProtocolStep s a = s := by
  simp [remoteProtocolStep, sameId, changedBody]

theorem remote_protocol_terminal_version_unchanged (s : RemoteProtocolState) (a : RemoteProtocolAttempt)
    (terminal : s.terminal = true) : remoteProtocolStep s a = s ∧ (remoteProtocolStep s a).version = s.version := by
  simp [remoteProtocolStep, terminal]

theorem remote_protocol_replay_unchanged (s : RemoteProtocolState) (a : RemoteProtocolAttempt) :
    remoteProtocolStep (remoteProtocolStep s a) a = remoteProtocolStep s a := by
  unfold remoteProtocolStep
  split <;> simp_all

theorem remote_protocol_expired_unchanged (s : RemoteProtocolState) (a : RemoteProtocolAttempt)
    (expired : a.deadlineLive = false) : remoteProtocolStep s a = s := by
  simp [remoteProtocolStep, expired]

#print axioms remote_protocol_denied_unchanged
#print axioms remote_protocol_effect_requires_positive_authority
#print axioms remote_protocol_duplicate_id_consistent
#print axioms remote_protocol_terminal_version_unchanged
#print axioms remote_protocol_replay_unchanged
#print axioms remote_protocol_expired_unchanged

end Commerce
