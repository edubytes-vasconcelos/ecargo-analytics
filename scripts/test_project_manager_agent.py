"""Direct project queries remain available independently of the AI provider."""
import os
import unittest
from unittest.mock import patch

import project_manager_agent as agent


class ActivityQueryTests(unittest.TestCase):
    def setUp(self):
        self.project = {
            'name': agent.SUPPORTED_PROJECT_NAME,
            'workItemColumns': [
                {'id': 'dev', 'title': 'Em Desenv'},
                {'id': 'waiting', 'title': 'Para Desenv'},
                {'id': 'homol', 'title': 'Em Homol'},
            ],
            'workItems': [
                {'id': '1', 'title': 'Implementar taxas', 'assignee': 'Eduardo Samoggin', 'status': 'dev'},
                {'id': '2', 'title': 'Aguardando desenvolvimento', 'assignee': 'Eduardo Samoggin', 'status': 'waiting'},
                {'id': '3', 'title': 'Validar com cliente', 'assignee': 'Eduardo Samoggin', 'status': 'homol'},
                {'id': '4', 'title': 'Atividade de outra pessoa', 'assignee': 'Bruno', 'status': 'dev'},
                {'id': '5', 'title': 'Arquivada', 'assignee': 'Eduardo Samoggin', 'status': 'dev', 'archived': True},
            ],
        }

    def test_exact_question_does_not_depend_on_ai(self):
        with patch.dict(os.environ, {'OPENAI_API_KEY': 'test-only'}), patch.object(agent, '_openai_answer', side_effect=RuntimeError('offline')) as ai:
            result = agent.respond(self.project, 'atividades em desenvolvimento do Eduardo Samoggin')
        ai.assert_not_called()
        self.assertEqual(result['provider'], 'interno')
        self.assertIn('(1)', result['answer'])
        self.assertIn('Implementar taxas', result['answer'])
        for excluded in ['Aguardando desenvolvimento', 'Validar com cliente', 'Atividade de outra pessoa', 'Arquivada']:
            self.assertNotIn(excluded, result['answer'])

    def test_name_and_stage_are_case_and_accent_insensitive(self):
        result = agent.respond(self.project, 'QUAIS ATIVIDADES EM DESENV DO eduardo samoggin?')
        self.assertIn('Implementar taxas', result['answer'])

    def test_unknown_owner_does_not_return_other_peoples_work(self):
        result = agent.respond(self.project, 'atividades em desenvolvimento do Carlos')
        self.assertIn('Não encontrei responsável', result['answer'])
        self.assertNotIn('Implementar taxas', result['answer'])
        result = agent.respond(self.project, 'atividades do Carlos em desenvolvimento')
        self.assertIn('Não encontrei responsável', result['answer'])
        self.assertNotIn('Implementar taxas', result['answer'])

    def test_ambiguous_first_name_requires_clarification(self):
        self.project['workItems'].append({'title': 'Outra atividade', 'assignee': 'Eduardo Silva', 'status': 'dev'})
        result = agent.respond(self.project, 'atividades em desenvolvimento do Eduardo')
        self.assertIn('mais de um responsável', result['answer'])

    def test_empty_result_and_custom_column(self):
        result = agent.respond(self.project, 'atividades Em Homol do Bruno')
        self.assertIn('(0)', result['answer'])
        result = agent.respond(self.project, 'atividades Para Desenv do Eduardo Samoggin')
        self.assertIn('Aguardando desenvolvimento', result['answer'])
        self.assertNotIn('Implementar taxas', result['answer'])

    def test_analysis_still_uses_ai(self):
        with patch.dict(os.environ, {'OPENAI_API_KEY': 'test-only'}), patch.object(agent, '_openai_answer', return_value='Análise do projeto') as ai:
            result = agent.respond(self.project, 'Explique as atividades em desenvolvimento do Eduardo Samoggin')
        ai.assert_called_once()
        self.assertEqual(result['answer'], 'Análise do projeto')


if __name__ == '__main__':
    unittest.main()
