# Login próprio e administração de usuários

O painel usa contas locais, sem Microsoft Entra. A consulta do painel continua disponível sem login; alterações em projetos, mensagens, envio e download de evidências exigem uma sessão e a troca da senha inicial. As configurações do painel e a administração de usuários exigem perfil Administrador.

## Primeiro administrador

No mesmo ambiente e com o mesmo `DATA_DIR` do serviço, execute:

```powershell
python scripts/manage_users.py bootstrap
```

O comando solicita nome, e-mail e senha sem exibi-la. Só pode criar o administrador inicial quando ainda não existem contas locais. Não há senha padrão nem endpoint público para criação de administradores.

Em Kubernetes, o comando também está disponível na imagem:

```sh
kubectl -n SEU_NAMESPACE exec -it deployment/SEU_DEPLOYMENT -- python scripts/manage_users.py bootstrap
```

Entre pelo botão **Entrar**. Mesmo o administrador precisa trocar a senha inicial no primeiro acesso. Depois, use **Usuários** para cadastrar colaboradores ou outros administradores. A senha inicial gerada aparece somente na resposta da criação ou redefinição, para entrega direta à pessoa; não é enviada por e-mail e não deve ser colocada em logs.

## Perfis e recuperação

- Administrador: gerencia contas, perfis, ativação e configurações; também colabora nos cards.
- Colaborador: edita projetos e atividades, troca mensagens e envia evidências; não pode gerenciar contas ou configurações.
- A desativação, redefinição da senha ou alteração do perfil encerra as sessões da conta afetada. O último administrador ativo não pode ser desativado ou rebaixado.
- O administrador pode gerar uma nova senha inicial para outra conta. Quem perdeu a senha deve pedir a redefinição; não há recuperação automática por e-mail.
- Caso nenhum administrador consiga entrar, um operador com acesso ao ambiente pode executar `python scripts/manage_users.py reset-password`. O comando pede e-mail e nova senha inicial, invalida as sessões e exige nova troca no próximo login.

## Implantação

Senhas têm entre 12 e 256 caracteres e ficam armazenadas com scrypt, salt individual e parâmetros N=16384, r=8, p=5. Cookies são HttpOnly, SameSite=Lax e Secure por padrão. Use HTTPS no ambiente publicado. Para desenvolvimento local em HTTP, configure `AUTH_COOKIE_SECURE=0` antes de iniciar o serviço. Não use essa opção para publicação pela internet.

As sessões expiram após oito horas e as alterações exigem token CSRF. Tentativas inválidas de login são limitadas por endereço de origem e conta. A autoria vem exclusivamente da sessão do servidor; o nome enviado no corpo de uma mensagem não substitui o autor autenticado.

Contas, hashes, sessões e notificações ficam em `DATA_DIR/project_auth.sqlite`; mantenha esse volume persistente e inclua-o no backup junto de `projects.json` e das evidências. Use uma réplica do serviço, pois a escrita do arquivo de projetos JSON é protegida por processo.

A URL do sistema pode conter `BASE_PATH`: os cookies e as chamadas da interface respeitam esse caminho. A integração `MS_GRAPH_*` de leitura do SharePoint continua independente.

## Notificações por e-mail

Quando alguém publica uma mensagem que gera uma notificação no painel (menção, responsável ou resposta), o sistema também tenta enviar um e-mail ao usuário ativo. A notificação interna é gravada antes do envio; uma falha no relay não impede o comentário nem remove a notificação do painel.

Configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_STARTTLS`, `SMTP_FROM` e `APP_PUBLIC_URL` no ambiente. Para o relay HML, o host validado é `login-relay01.loginlogistica.com.br`, porta `25`, com STARTTLS. A mensagem usa a conta do destinatário cadastrada no painel. O relay não anunciou SMTP AUTH no teste; a integração não envia credenciais. **O envio fica desativado enquanto `SMTP_FROM` não estiver configurado** com um endereço autorizado pelo time de infraestrutura. Não invente ou use um remetente antes dessa confirmação.

O envio usa timeout limitado, corpo em texto simples e não registra o conteúdo do e-mail nos logs. `APP_PUBLIC_URL` deve ser a URL acessível ao usuário, incluindo o caminho do painel. Em HML, `SMTP_STARTTLS=0` foi autorizado explicitamente para permitir o relay atual; a conexão entre o pod e o relay não é criptografada. Não reutilize essa configuração em produção.

## Verificação

```powershell
python scripts/test_project_management.py
python scripts/smoke_project_management.py
```

Os testes criam dados e contas temporários. Não cadastram usuários reais. O teste no navegador precisa do Playwright já instalado no ambiente de desenvolvimento.

Referências: [armazenamento de senhas OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html), [hashlib.scrypt](https://docs.python.org/3/library/hashlib.html).

## Publicação em homologação

O ambiente atual é o namespace `hml-signa-ecargo`, no contexto `cluster-tvv-stg-001`, acessível em `https://ecargohml.k8s.loginlogistica.com.br/ecargo-analytics/projetos`.

O GitHub Actions gera a imagem Docker com tag do commit. O deploy automático antigo não alcança o DNS interno do Rancher a partir do runner público. Enquanto esse acesso de rede não for disponibilizado, a atualização deve ser feita de uma máquina com acesso ao cluster, usando a imagem imutável publicada:

```sh
kubectl --context cluster-tvv-stg-001 -n hml-signa-ecargo set image deployment/ecargo-analytics ecargo-analytics=ghcr.io/edubytes-vasconcelos/ecargo-analytics:SHA_DO_COMMIT
kubectl --context cluster-tvv-stg-001 -n hml-signa-ecargo rollout status deployment/ecargo-analytics --timeout=300s
```

Mantenha `IMAGE` em `k8s/vars.hml.env` apontando para a mesma tag. Antes de atualizar, faça backup dos JSONs e bancos SQLite do volume `/app/data`. Para reversão, use o digest da imagem anteriormente executada; uma tag reutilizável de branch pode já apontar para outra versão.
