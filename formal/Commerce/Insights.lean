namespace Commerce

/-- Scoped Insights model: four tenants and dataset generations, bounded integer
    cells, and a result limit of at most fifty. Authorization and validated source
    projection are inputs; this does not prove SQL, connector security or PHP. -/
structure InsightsDataset where
  tenant : Fin 4
  version : Fin 4
  active : Bool
  values : List (Fin 21)

structure InsightsQuery where
  tenant : Fin 4
  authorized : Bool
  datasetAccess : Bool
  reportAccess : Bool
  limit : Fin 51

def insightsRows (d : InsightsDataset) (q : InsightsQuery) : List (Fin 21) :=
  if q.authorized = true ∧ q.datasetAccess = true ∧ q.reportAccess = true ∧ d.active = true ∧ q.tenant = d.tenant then
    d.values.take q.limit.val
  else []

def insightsResponse (d : InsightsDataset) (q : InsightsQuery) :=
  (d.version, insightsRows d q)

theorem insights_denied_empty (d : InsightsDataset) (q : InsightsQuery)
    (denied : q.authorized = false) : insightsRows d q = [] := by
  simp [insightsRows, denied]

theorem insights_shared_report_cannot_elevate_dataset (d : InsightsDataset) (q : InsightsQuery)
    (denied : q.datasetAccess = false) : insightsRows d q = [] := by
  simp [insightsRows, denied]

theorem insights_disabled_empty (d : InsightsDataset) (q : InsightsQuery)
    (disabled : d.active = false) : insightsRows d q = [] := by
  simp [insightsRows, disabled]

theorem insights_foreign_tenant_empty (d : InsightsDataset) (q : InsightsQuery)
    (foreign : q.tenant ≠ d.tenant) : insightsRows d q = [] := by
  simp [insightsRows, foreign]

theorem insights_result_limit_bounded (d : InsightsDataset) (q : InsightsQuery) :
    (insightsRows d q).length ≤ 50 := by
  unfold insightsRows
  split
  · simp only [List.length_take]
    have bound := q.limit.isLt
    omega
  · simp

theorem insights_freshness_reports_current_generation (d : InsightsDataset) (q : InsightsQuery) :
    (insightsResponse d q).1 = d.version := by
  rfl

#print axioms insights_denied_empty
#print axioms insights_shared_report_cannot_elevate_dataset
#print axioms insights_disabled_empty
#print axioms insights_foreign_tenant_empty
#print axioms insights_result_limit_bounded
#print axioms insights_freshness_reports_current_generation

end Commerce
