import {useEffect} from 'preact/compat';
import {useRouter} from 'preact-router';

export function NotFoundPage(props: any) {
  const [_route, navigate] = useRouter();
  useEffect(() => {
    const timer = setTimeout(() => {
      navigate('/', true);
    }, 5e3);
    return () => {
      clearTimeout(timer);
    };
  }, []);
  return (
    <div className="container py-8 text-center">
      Page not found... You will be redirected
    </div>
  );
}
