CREATE DATABASE IF NOT EXISTS `nest_tutorial`;
CREATE DATABASE IF NOT EXISTS `nest_tutorial_test`;

GRANT ALL PRIVILEGES ON `nest_tutorial`.* TO 'root'@'%';
GRANT ALL PRIVILEGES ON `nest_tutorial_test`.* TO 'root'@'%';
FLUSH PRIVILEGES;