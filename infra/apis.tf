locals {
  services = [
    "artifactregistry.googleapis.com",
    "billingbudgets.googleapis.com",
    "cloudbilling.googleapis.com",
    "cloudresourcemanager.googleapis.com",
    "compute.googleapis.com",
    "iam.googleapis.com",
    "iap.googleapis.com",
    "logging.googleapis.com",
    "secretmanager.googleapis.com",
  ]
}

resource "google_project_service" "services" {
  for_each = toset(local.services)

  service = each.value
  # Turning an API off would break whatever still uses it, so leave them on.
  disable_on_destroy = false
}

data "google_project" "this" {}
