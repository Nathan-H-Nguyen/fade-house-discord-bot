resource "google_artifact_registry_repository" "images" {
  repository_id = "fade-house"
  location      = var.region
  format        = "DOCKER"
  description   = "Images of the bot, tagged by git commit SHA."

  # Keep the 5 newest images, enough to roll back, and stay inside the free 0.5 GB.
  cleanup_policy_dry_run = false
  cleanup_policies {
    id     = "keep-recent"
    action = "KEEP"
    most_recent_versions {
      keep_count = 5
    }
  }
  cleanup_policies {
    id     = "delete-rest"
    action = "DELETE"
    condition {
      tag_state = "ANY"
    }
  }

  depends_on = [google_project_service.services]
}
