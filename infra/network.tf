# A network of our own rather than "default", which allows SSH and RDP from anywhere.
resource "google_compute_network" "bot" {
  name                    = "fade-house"
  auto_create_subnetworks = false

  depends_on = [google_project_service.services]
}

resource "google_compute_subnetwork" "bot" {
  name          = "fade-house-${var.region}"
  network       = google_compute_network.bot.id
  ip_cidr_range = "10.10.0.0/24"
}

# The only way in: SSH through Identity-Aware Proxy, which checks your Google login first.
# The bot itself needs no inbound traffic, as it connects out to Discord.
resource "google_compute_firewall" "iap_ssh" {
  name          = "fade-house-allow-iap-ssh"
  network       = google_compute_network.bot.id
  direction     = "INGRESS"
  source_ranges = ["35.235.240.0/20"]

  allow {
    protocol = "tcp"
    ports    = ["22"]
  }
}
