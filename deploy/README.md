# Deploy no Rancher

## 1. Build da imagem

```powershell
cd C:\Fontes\Extracao222
docker build -t REGISTRY/PROJETO/ecargo-analytics:VERSAO .
docker push REGISTRY/PROJETO/ecargo-analytics:VERSAO
```

Substitua `REGISTRY/PROJETO` pelo registry usado pelo cluster Rancher.

## 2. Ajustes antes de aplicar

No arquivo `deploy/ecargo-analytics.yaml`:

- use uma tag imutável da imagem publicada, por exemplo o SHA do commit. O cluster bloqueia `latest`;
- troque o host `ecargo-analytics.loginlogistica.com.br` pelo DNS desejado;
- cadastre `ECARGO_222_USER`, `ECARGO_222_PASSWORD` e, se for usar SharePoint, `MS_GRAPH_TENANT_ID`, `MS_GRAPH_CLIENT_ID` e `MS_GRAPH_CLIENT_SECRET` como Secret no Rancher.

## 3. Aplicar pelo Rancher

No Rancher:

1. Escolha o cluster/projeto correto.
2. Importe o YAML em `Apps` ou `Workloads`.
3. Confirme namespace, image, service e ingress.
4. Valide se o pod ficou `Running`.

## Observação

A busca direta no 222 usa a API operacional antiga e pode retornar menos chamados que o Excel exportado. Para números gerenciais, mantenha o upload do Excel como fonte confiável até a integração com a API nova ou com o endpoint de exportação oficial.

## Configuração que funcionou no Rancher

URL publicada:

```text
https://ecargohml.k8s.loginlogistica.com.br/ecargo-analytics
```

Deployment:

```text
HOST=0.0.0.0
PORT=8765
BASE_PATH=/ecargo-analytics
```

Ingress:

```yaml
spec:
  ingressClassName: kong
  rules:
    - host: ecargohml.k8s.loginlogistica.com.br
      http:
        paths:
          - path: /ecargo-analytics
            pathType: Prefix
            backend:
              service:
                name: ecargo-analytics
                port:
                  number: 80
  tls:
    - hosts:
        - ecargohml.k8s.loginlogistica.com.br
      secretName: lets-login
```

Observações:

- O Service fica `80 -> 8765`.
- O cluster bloqueia imagem com tag `latest`; use tag imutável com SHA do commit.
- O package no GHCR precisa estar público, ou o Deployment precisa de `imagePullSecret`.
- A base acumulada fica em SQLite no volume persistente montado em `/app/data`.
- O Excel deve ser usado como carga inicial confiável.
- Depois da carga inicial, o app sincroniza a API 222 automaticamente a cada hora.
- A sincronização incremental usa `update_time` com janela de 2 horas (`SYNC_LOOKBACK_HOURS=2`) para reduzir risco de perder atualizações.

## Integração com SharePoint

Para cadastrar uma URL do SharePoint na tela de Projetos, configure uma aplicação no Microsoft Entra ID/Azure AD com permissão de aplicação para ler arquivos do SharePoint. No Rancher, informe no Secret:

```text
MS_GRAPH_TENANT_ID=<tenant id>
MS_GRAPH_CLIENT_ID=<application/client id>
MS_GRAPH_CLIENT_SECRET=<client secret>
```

Permissões recomendadas no Microsoft Graph:

- `Sites.Read.All` como Application permission, com consentimento de administrador; ou
- `Sites.Selected`, se a organização preferir liberar apenas sites específicos.

Depois disso, no cadastro do projeto, use a URL da pasta ou do arquivo no SharePoint. Se a URL apontar para uma pasta/biblioteca, o app seleciona o arquivo `.xml`, `.mpp` ou `.mpt` mais recente. Se apontar diretamente para um arquivo, ele usa esse arquivo. A leitura automática de métricas continua exigindo XML.

Enquanto a permissão de SharePoint não estiver liberada, a tela de Projetos aceita upload manual de um cronograma `.xml`, `.mpp` ou `.mpt`. O arquivo fica salvo no volume persistente em `DATA_DIR/project_uploads`; para leitura automática de métricas, use XML.
