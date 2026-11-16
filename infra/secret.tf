# The bot's environment variables (the same lines as .env), token included.
# Terraform creates the secret but never its value, so the token stays out of Terraform state:
# add each version by hand, as the README's "Hosting" section describes.
resource "google_secret_manager_secret" "bot_env" {
  secret_id = "fade-house-env"

  replication {
    user_managed {
      replicas {
        location = var.region
      }
    }
  }

  depends_on = [google_project_service.services]
}
