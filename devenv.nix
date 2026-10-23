{ pkgs, ... }:
let
  # The host CLI has no third-party JS dependencies. Package installation belongs
  # to the container's safe-chain wrappers, never an implicit shell-enter hook.
  bun = pkgs.writeShellScriptBin "bun" ''
    case "''${1:-}" in
      install|ci|i|add|a|remove|rm|update|x|create|upgrade|link|unlink|pm)
        echo "Use run deps lock / run image build: package installation is safe-chain managed inside Docker." >&2
        exit 1;;
    esac
    exec ${pkgs.bun}/bin/bun "$@"
  '';
in {
  packages = [ bun pkgs.git pkgs.docker-client pkgs.glibcLocales ];
  enterShell = ''
    export PATH="$DEVENV_ROOT/cli/bin:$PATH"
  '';
  cachix.enable = false;
  devenv.warnOnNewVersion = false;
}
