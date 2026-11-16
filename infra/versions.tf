terraform {
  required_version = "~> 1.17"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 8.11"
    }
  }

  # Made by hand before the first run: see "Hosting" in the README.
  backend "gcs" {
    bucket = "fade-house-bot-tfstate"
    prefix = "prod"
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
  zone    = var.zone

  # Bill API calls such as budgets to this project rather than the client's own.
  user_project_override = true
  billing_project       = var.project_id
}
