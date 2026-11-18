import { useApp } from '../app/AppContext';
import { ScreenHeader } from '../components/ScreenHeader';
import { StateBlock } from '../components/StateBlock';

export function NotFound() {
  const { shell } = useApp();
  return (
    <>
      <ScreenHeader title={shell.notFound.title} />
      <StateBlock kind="unknown" title={shell.notFound.title} body={shell.notFound.body}>
        <p><a className="btn btn-link" href="#/">{shell.notFound.home}</a></p>
      </StateBlock>
    </>
  );
}
