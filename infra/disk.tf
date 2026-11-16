# Holds the database at /data. It is separate from the VM so the VM can be replaced without losing it.
resource "google_compute_disk" "data" {
  name = "fade-house-data"
  type = "pd-standard"
  size = 10

  lifecycle {
    prevent_destroy = true
  }

  depends_on = [google_project_service.services]
}

# A weekly snapshot, keeping 4, as a second backup alongside the daily one in #bot-admin.
# Stored in the VM's region, where snapshot storage is in the free tier.
resource "google_compute_resource_policy" "weekly_snapshot" {
  name   = "fade-house-weekly-snapshot"
  region = var.region

  snapshot_schedule_policy {
    schedule {
      weekly_schedule {
        day_of_weeks {
          day        = "SUNDAY"
          start_time = "12:00" # UTC, after the 03:00 house-time backup.
        }
      }
    }
    retention_policy {
      max_retention_days    = 28
      on_source_disk_delete = "KEEP_AUTO_SNAPSHOTS"
    }
    snapshot_properties {
      storage_locations = [var.region]
    }
  }

  depends_on = [google_project_service.services]
}

resource "google_compute_disk_resource_policy_attachment" "data_snapshot" {
  name = google_compute_resource_policy.weekly_snapshot.name
  disk = google_compute_disk.data.name
}
