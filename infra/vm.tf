locals {
  registry   = "${var.region}-docker.pkg.dev"
  repository = "${local.registry}/${var.project_id}/${google_artifact_registry_repository.images.repository_id}"
}

resource "google_compute_instance" "bot" {
  name         = "fade-house"
  machine_type = "e2-micro" # The free-tier size.

  boot_disk {
    initialize_params {
      image = "cos-cloud/cos-stable"
      size  = 10
      type  = "pd-standard"
    }
  }

  attached_disk {
    source      = google_compute_disk.data.id
    device_name = "fade-house-data"
  }

  network_interface {
    subnetwork = google_compute_subnetwork.bot.id
    # An ephemeral public IPv4, so the bot can reach Discord. This is the main cost, about $3.60 a month.
    access_config {}
  }

  service_account {
    email  = google_service_account.vm.email
    scopes = ["cloud-platform"] # Access is limited by the account's roles instead.
  }

  shielded_instance_config {
    enable_secure_boot          = true
    enable_vtpm                 = true
    enable_integrity_monitoring = true
  }

  metadata = {
    user-data = templatefile("${path.module}/cloud-init.yaml", {
      registry   = local.registry
      repository = local.repository
      secret     = google_secret_manager_secret.bot_env.id
    })
    # The image to run. Empty until the first deploy, which keeps the bot stopped until then.
    fade-house-image       = ""
    enable-oslogin         = "TRUE"
    google-logging-enabled = "true"
    block-project-ssh-keys = "TRUE"
  }

  lifecycle {
    # Deploys change the image; Terraform must not reset it.
    ignore_changes = [metadata["fade-house-image"]]
  }

  allow_stopping_for_update = true

  depends_on = [
    google_artifact_registry_repository_iam_member.vm_pull,
    google_secret_manager_secret_iam_member.vm_env,
  ]
}
