# Auto-updated by release.yml on tag v0.1.14. Do not edit manually.
class Keirouter < Formula
  desc "AI API router — unified gateway for 20+ LLM providers with fallback, caching, and dashboard"
  homepage "https://github.com/mydisha/keirouter"
  version "0.1.14"
  license "MIT"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/mydisha/keirouter/releases/download/v0.1.14/keirouter_v0.1.14_darwin_arm64.tar.gz"
      sha256 "8d40593b0f1ca4bd6d1e0de34dbec00941a06ff4a8f09ebaf904e93f701320ee"
    else
      url "https://github.com/mydisha/keirouter/releases/download/v0.1.14/keirouter_v0.1.14_darwin_amd64.tar.gz"
      sha256 "009e78055781257ab72654518be0d27c7c626ed4efc0a9de5b048ace411c983e"
    end
  end

  on_linux do
    if Hardware::CPU.arm?
      url "https://github.com/mydisha/keirouter/releases/download/v0.1.14/keirouter_v0.1.14_linux_arm64.tar.gz"
      sha256 "e05e483b2fda36504382ab5437e1e58d56d94354e762a1548cdcb9fbc74e1404"
    else
      url "https://github.com/mydisha/keirouter/releases/download/v0.1.14/keirouter_v0.1.14_linux_amd64.tar.gz"
      sha256 "0b629dad77ee00407580eb609f21022165eaf6765790d831a1f2b396c7478ee9"
    end
  end

  def install
    bin.install "keirouter"
    (share/"keirouter").install "frontend"
  end

  def caveats
    <<~EOS
      Quick start:
        keirouter -bootstrap    # create your first API key
        keirouter               # start server on :20180

      Dashboard: http://localhost:20180  (default password: keirouter)
    EOS
  end

  test do
    assert_match "KeiRouter", shell_output("\#{bin}/keirouter --help 2>&1", 2)
  end
end
