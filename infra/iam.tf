# The VM's identity: it can pull images, read the bot's env and write logs, and nothing else.
resource "google_service_account" "vm" {
  account_id   = "fade-house-vm"
  display_name = "Fade House bot VM"
}

resource "google_artifact_registry_repository_iam_member" "vm_pull" {
  repository = google_artifact_registry_repository.images.name
  location   = google_artifact_registry_repository.images.location
  role       = "roles/artifactregistry.reader"
  member     = google_service_account.vm.member
}

resource "google_secret_manager_secret_iam_member" "vm_env" {
  secret_id = google_secret_manager_secret.bot_env.id
  role      = "roles/secretmanager.secretAccessor"
  member    = google_service_account.vm.member
}

resource "google_project_iam_member" "vm_logs" {
  project = var.project_id
  role    = "roles/logging.logWriter"
  member  = google_service_account.vm.member
}
