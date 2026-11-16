# Looked up by name so the account's ID stays out of this public repo.
data "google_billing_account" "this" {
  display_name = "My Billing Account"
  open         = true
}

# Emails the billing account's admins as spending passes each threshold of the monthly budget.
resource "google_billing_budget" "monthly" {
  billing_account = data.google_billing_account.this.id
  display_name    = "Fade House bot"

  budget_filter {
    projects = ["projects/${data.google_project.this.number}"]
  }

  amount {
    specified_amount {
      currency_code = "USD"
      units         = tostring(var.budget_usd)
    }
  }

  dynamic "threshold_rules" {
    for_each = [0.5, 0.9, 1.0]
    content {
      threshold_percent = threshold_rules.value
    }
  }

  depends_on = [google_project_service.services]
}
