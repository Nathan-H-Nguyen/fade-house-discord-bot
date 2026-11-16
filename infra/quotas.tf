# Caps the vCPUs the whole project can run, so stolen credentials cannot be used to start a fleet of VMs.
# The e2-micro counts as 1; 2 leaves room for a replacement VM. GPUs are already capped at 0 for this project.
resource "google_cloud_quotas_quota_preference" "cpus_all_regions" {
  parent   = "projects/${var.project_id}"
  name     = "compute_googleapis_com-cpus-all-regions"
  service  = "compute.googleapis.com"
  quota_id = "CPUS-ALL-REGIONS-per-project"

  # Cutting 32 to 2 is deliberate; this skips only the "large percentage decrease" check,
  # not the one that refuses to go below current usage.
  ignore_safety_checks = "QUOTA_DECREASE_PERCENTAGE_TOO_HIGH"

  quota_config {
    preferred_value = 2
  }

  depends_on = [google_project_service.services]
}
