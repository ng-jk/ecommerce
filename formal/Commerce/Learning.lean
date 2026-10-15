namespace Commerce

/-- Finite abstraction: one assessment with two questions, at most two attempts,
    pass threshold 1..100, and a delivered-lessons flag. Authentication, answer-key
    secrecy, answer validation, course/grant lookup and serialized enrollment
    updates are external assumptions. Delivery does not prove study. -/
structure LearningState where
  attempts : Fin 3
  lastCorrect : Fin 3
  passed : Bool
  complete : Bool
  deriving DecidableEq

structure LearningSubmission where
  authorized : Bool
  publishedEnrolledGranted : Bool
  correctFromServerKey : Fin 3
  passThreshold : Fin 101
  allLessonsDelivered : Bool
  deriving DecidableEq

def learningScore (correct : Fin 3) : Nat := 50 * correct.val

def learningSubmit (s : LearningState) (a : LearningSubmission) : LearningState :=
  if h : a.authorized = true ∧ a.publishedEnrolledGranted = true ∧ s.attempts.val < 2 ∧ a.passThreshold.val > 0 then
    let passed := s.passed || decide (learningScore a.correctFromServerKey ≥ a.passThreshold.val)
    { attempts := ⟨s.attempts.val + 1, by omega⟩,
      lastCorrect := a.correctFromServerKey, passed := passed,
      complete := a.allLessonsDelivered && passed }
  else s

theorem learning_denied_unchanged (s : LearningState) (a : LearningSubmission)
    (denied : a.authorized = false) : learningSubmit s a = s := by
  simp [learningSubmit, denied]

theorem learning_unavailable_unchanged (s : LearningState) (a : LearningSubmission)
    (unavailable : a.publishedEnrolledGranted = false) : learningSubmit s a = s := by
  simp [learningSubmit, unavailable]

theorem learning_exhausted_unchanged (s : LearningState) (a : LearningSubmission)
    (exhausted : s.attempts.val = 2) : learningSubmit s a = s := by
  simp [learningSubmit, exhausted]

theorem learning_server_score_bounded (correct : Fin 3) : learningScore correct ≤ 100 := by
  unfold learningScore
  omega

theorem learning_completion_requires_pass (s : LearningState) (a : LearningSubmission)
    (prior : s.complete = true → s.passed = true) :
    (learningSubmit s a).complete = true → (learningSubmit s a).passed = true := by
  unfold learningSubmit
  split <;> simp_all

theorem learning_submission_records_server_key (s : LearningState) (a : LearningSubmission)
    (authorized : a.authorized = true) (access : a.publishedEnrolledGranted = true)
    (remaining : s.attempts.val < 2) (threshold : a.passThreshold.val > 0) :
    (learningSubmit s a).lastCorrect = a.correctFromServerKey ∧
    (learningSubmit s a).attempts.val = s.attempts.val + 1 := by
  simp [learningSubmit, authorized, access, remaining, threshold]

#print axioms learning_denied_unchanged
#print axioms learning_unavailable_unchanged
#print axioms learning_exhausted_unchanged
#print axioms learning_server_score_bounded
#print axioms learning_completion_requires_pass
#print axioms learning_submission_records_server_key

end Commerce
