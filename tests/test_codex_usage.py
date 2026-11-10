import importlib.util
from pathlib import Path
from types import SimpleNamespace
import json
import unittest

spec = importlib.util.spec_from_file_location('codex_usage', Path(__file__).resolve().parents[1]/'codex-usage.py')
usage = importlib.util.module_from_spec(spec)
spec.loader.exec_module(usage)

class TerminalModelTests(unittest.TestCase):
    def test_footer_not_conversation_mentions(self):
        text = 'Please use gpt-6.1-sol high\n  GPT-6.1-Sol medium · ~ · My task'
        result = usage.parse_footer(text)
        self.assertEqual(result['effort'], 'medium')
        self.assertEqual(result['model'], 'GPT-6.1-Sol')

    def test_ansi_and_unknown_footer(self):
        self.assertEqual(usage.parse_footer('\x1b[33m  gpt-6.1-astra ultra · ~\x1b[0m')['effort'], 'ultra')
        self.assertIsNone(usage.parse_footer('No model information in this conversation'))

    def test_same_folder_agents_keep_distinct_models_and_effort(self):
        calls = []
        def run(argv, **kwargs):
            args = argv[1:]
            calls.append(args)
            if args[0] == 'ls':
                data = {'terminals':[{'address':t, 'agent':'codex', 'cwd':'/same/folder'} for t in ['t1','t2','t3','remote/t1']]}
            elif args[0] == 'get':
                data = {'foreground':{'name':'bash' if args[1] == 't3' else 'codex', 'pid':42}, 'turn':2}
            else:
                self.assertEqual(args[0], 'read')
                self.assertEqual(args[2:], ['--lines','0'])
                footer = 'GPT-6.1-Sol high' if args[1]=='t1' else 'GPT-6.1-Astra medium'
                return SimpleNamespace(returncode=0, stdout=f'  {footer} · /same/folder')
            return SimpleNamespace(returncode=0, stdout=json.dumps(data))
        models = usage.terminal_models(run)
        self.assertEqual(models['t1']['model'], 'GPT-6.1-Sol')
        self.assertEqual(models['t1']['effort'], 'high')
        self.assertEqual(models['t2']['model'], 'GPT-6.1-Astra')
        self.assertEqual(models['t2']['effort'], 'medium')
        self.assertNotIn('t3',models) # Shell does not inherit a past agent's settings.
        self.assertNotIn('remote/t1',models)
        self.assertTrue(all(c[0] in ['ls','get','read'] for c in calls))

    def test_failed_connection_has_no_guessed_model(self):
        def run(*args, **kwargs): return SimpleNamespace(returncode=1, stdout='')
        self.assertEqual(usage.terminal_models(run), {})

if __name__ == '__main__': unittest.main()
