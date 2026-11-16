# Lets GitHub Actions act in this project without stored keys, through Workload Identity Federation.
# GitHub signs a short-lived token for each workflow run; Google trusts it only when it comes from
# this repository's main branch, identified by the IDs GitHub assigns, which survive renames.

resource "google_iam_workload_identity_pool" "github" {
  workload_identity_pool_id = "github"
  display_name              = "GitHub Actions"

  depends_on = [google_project_service.services]
}

resource "google_iam_workload_identity_pool_provider" "github" {
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "fade-house-discord-bot"
  display_name                       = "fade-house-discord-bot"

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }

  attribute_mapping = {
    "google.subject"        = "assertion.sub"
    "attribute.environment" = "assertion.environment"
  }

  # Pull requests, forks and other branches never get past this.
  attribute_condition = join(" && ", [
    "assertion.repository_id == '${var.github_repository_id}'",
    "assertion.repository_owner_id == '${var.github_owner_id}'",
    "assertion.ref == 'refs/heads/main'",
  ])
}

locals {
  github_principals = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}"
}

# Builds images on main and pushes them to the registry, and nothing else.
resource "google_service_account" "build" {
  account_id   = "fade-house-build"
  display_name = "GitHub Actions: build images"

  depends_on = [google_project_service.services]
}

resource "google_service_account_iam_member" "build_from_github" {
  service_account_id = google_service_account.build.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "${local.github_principals}/*"
}

resource "google_artifact_registry_repository_iam_member" "build_push" {
  repository = google_artifact_registry_repository.images.name
  location   = google_artifact_registry_repository.images.location
  role       = "roles/artifactregistry.writer"
  member     = google_service_account.build.member
}

# Sets which image the VM runs, and nothing else.
# Only jobs in the "production" GitHub environment, which needs your approval, can use it.
resource "google_service_account" "deploy" {
  account_id   = "fade-house-deploy"
  display_name = "GitHub Actions: deploy to the VM"

  depends_on = [google_project_service.services]
}

resource "google_service_account_iam_member" "deploy_from_github" {
  service_account_id = google_service_account.deploy.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "${local.github_principals}/attribute.environment/production"
}

resource "google_artifact_registry_repository_iam_member" "deploy_read" {
  repository = google_artifact_registry_repository.images.name
  location   = google_artifact_registry_repository.images.location
  role       = "roles/artifactregistry.reader"
  member     = google_service_account.deploy.member
}

resource "google_project_iam_custom_role" "set_vm_image" {
  role_id     = "fadeHouseSetVmImage"
  title       = "Set the Fade House VM's image"
  description = "Read the VM and change its metadata, which holds the image to run."
  permissions = ["compute.instances.get", "compute.instances.setMetadata"]
}

resource "google_compute_instance_iam_member" "deploy_set_image" {
  instance_name = google_compute_instance.bot.name
  zone          = google_compute_instance.bot.zone
  role          = google_project_iam_custom_role.set_vm_image.id
  member        = google_service_account.deploy.member
}

# Changing an instance's metadata requires acting as the service account it runs as.
resource "google_service_account_iam_member" "deploy_act_as_vm" {
  service_account_id = google_service_account.vm.name
  role               = "roles/iam.serviceAccountUser"
  member             = google_service_account.deploy.member
}

# gcloud waits on the metadata change's zone operation to report success.
resource "google_project_iam_custom_role" "read_operations" {
  role_id     = "fadeHouseReadOperations"
  title       = "Read Compute Engine zone operations"
  description = "Lets a deploy wait for the metadata change it made."
  permissions = ["compute.zoneOperations.get"]
}

resource "google_project_iam_member" "deploy_read_operations" {
  project = var.project_id
  role    = google_project_iam_custom_role.read_operations.id
  member  = google_service_account.deploy.member
}

output "github_workload_identity_provider" {
  description = "For the workflows' google-github-actions/auth step."
  value       = google_iam_workload_identity_pool_provider.github.name
}

output "build_service_account" {
  value = google_service_account.build.email
}

output "deploy_service_account" {
  value = google_service_account.deploy.email
}
