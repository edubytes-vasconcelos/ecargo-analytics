# GitHub como fonte para Rancher

O Rancher/Kubernetes não executa o código Python direto do GitHub. Ele precisa de uma imagem Docker.

O fluxo recomendado é:

1. GitHub guarda o código.
2. GitHub Actions cria a imagem Docker.
3. GitHub Container Registry guarda a imagem.
4. Rancher usa essa imagem no Deployment.

## Imagem gerada

Depois do push para GitHub, o workflow `.github/workflows/docker-image.yml` publica:

```text
ghcr.io/OWNER/REPOSITORIO:latest
ghcr.io/OWNER/REPOSITORIO:SHA_DO_COMMIT
```

Exemplo:

```text
ghcr.io/signa/ecargo-analytics:latest
```

## Ajuste no YAML do Rancher

No arquivo `deploy/ecargo-analytics.yaml`, troque:

```yaml
image: REGISTRY/PROJETO/ecargo-analytics:latest
```

por:

```yaml
image: ghcr.io/OWNER/REPOSITORIO:latest
```

## Permissão de leitura

Se o repositório ou pacote GitHub for privado, o cluster Rancher precisa de um `imagePullSecret` com um token do GitHub com permissão de leitura de packages.

Se o pacote for público, normalmente não precisa de `imagePullSecret`.

## Alternativa com Rancher Continuous Delivery

Se o Rancher tiver Fleet/Continuous Delivery habilitado, ele pode acompanhar um repositório Git com os YAMLs. Mesmo nesse caso, o Deployment continua apontando para uma imagem Docker publicada em algum registry.
