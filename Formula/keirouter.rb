# Auto-updated by release.yml on tag v0.1.28. Do not edit manually.
class Keirouter < Formula
  desc "AI API router — unified gateway for 20+ LLM providers with fallback, caching, and dashboard"
  homepage "https://github.com/mydisha/keirouter"
  version "0.1.28"
  license "MIT"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/mydisha/keirouter/releases/download/v0.1.28/keirouter_v0.1.28_darwin_arm64.tar.gz"
      sha256 "ee79ad480316b9bac0b7ae4d1fce0cf020752c16574d1c76222af3c6692ba18c"
    else
      url "https://github.com/mydisha/keirouter/releases/download/v0.1.28/keirouter_v0.1.28_darwin_amd64.tar.gz"
      sha256 "7468e5334160c9a324a6b55a60419393c9d39223f9ede23a33150e0d6abeea32"
    end
  end

  on_linux do
    if Hardware::CPU.arm?
      url "https://github.com/mydisha/keirouter/releases/download/v0.1.28/keirouter_v0.1.28_linux_arm64.tar.gz"
      sha256 "6241546c8e225e0bbccbab6f386ac09589e8b9f3a0ba93d8e8e1c58b64f57991"
    else
      url "https://github.com/mydisha/keirouter/releases/download/v0.1.28/keirouter_v0.1.28_linux_amd64.tar.gz"
      sha256 "c2c0786775d970674a495c62c2aafd0120816d7dd02e206ac82748f7ba9bdd13"
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
        keirouter start         # start server on :20180

      Dashboard: http://localhost:20180  (default password: keirouter)
    EOS
  end

  test do
    assert_match "KeiRouter", shell_output("\#{bin}/keirouter --help 2>&1")
  end
end
